# astro-htmx Library Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an Astro integration that provides typed HTMX request parsing, response helpers, fragment detection, and sensible defaults for Astro + HTMX apps.

**Architecture:** Astro integration that auto-configures middleware for request parsing, exports response helpers with convenience methods on locals, and optionally injects client-side error handling, CSRF wiring, and Alpine.js bridge.

**Tech Stack:** Astro 5+, TypeScript, HTMX 4 (with HTMX 2 backwards compatibility)

**Requires:** `output: 'server'` or `'hybrid'` in Astro config. This library is not useful in static mode — middleware, request headers, and dynamic responses all require SSR.

---

## Design Principles

Based on research of django-htmx, htmx-go, laravel-htmx, rails-htmx, and htmx-spring-boot:

1. **Middleware parses, locals expose.** Every library attaches parsed headers to the request object. We use `Astro.locals.htmx`.
2. **Response helpers are chainable.** Consensus across Go, Laravel, Spring Boot. One builder, many methods.
3. **Convenience methods on locals.** `isPartial` (computed from `request && !boosted`) and `isTarget(id)` live on the locals object for ergonomic access. A standalone `isFragmentTarget(request, id)` exists for use outside middleware (API endpoints).
4. **HTMX 4 native, HTMX 2 compatible.** Normalise `tag#id` → `id` transparently. Handle both event naming conventions.
5. **Zero config for common patterns.** Error handling, CSRF, Alpine re-init should be opt-in defaults, not boilerplate.
6. **Astro partials are the fragment mechanism.** Document `export const partial = true` as the Astro-native way to serve HTMX fragments. `isFragmentTarget()` is for conditional rendering within full pages.

---

## Feature Comparison: What Exists vs What We Build

| Feature | django | go | laravel | rails | spring | **astro-htmx** |
|---------|--------|----|---------|-------|--------|----------------|
| Request header parsing | Yes | Yes | Yes | No | Yes | **Yes** |
| Typed locals object | Yes | Constants | Yes | No | Yes | **Yes** |
| `isPartial` / `isTarget()` | Yes | No | Yes | No | Annotations | **Yes** |
| Response builder | Basic | Chainable | Chainable | No | Chainable + Annotations | **Chainable** |
| Fragment detection | No | No | `@fragment` | Auto layout skip | `@HxRequest` routing | **`isTarget()` + `isFragmentTarget()`** |
| CSRF auto-wiring | No | No | No | No | Yes | **Yes (meta tag)** |
| Error swap prevention | Debug only | No | No | No | No | **Yes (configurable)** |
| Alpine re-init | N/A | N/A | N/A | N/A | N/A | **Yes** |
| HTMX 4 support | No | No | No | No | Partial | **Yes** |

---

## Package Structure

```
astro-htmx/
├── src/
│   ├── index.ts              # Astro integration entry point
│   ├── middleware.ts          # Request parsing middleware
│   ├── locals.ts              # HtmxLocals type + helpers
│   ├── response.ts            # Response builder
│   ├── fragment.ts            # Standalone fragment detection (for use outside middleware)
│   └── types.d.ts             # App.Locals type augmentation
├── tests/
│   ├── locals.test.ts         # parseHtmxHeaders, parseTarget, isPartial, isTarget tests
│   ├── response.test.ts       # HtmxResponse builder tests
│   └── fragment.test.ts       # isFragmentTarget standalone tests
├── package.json
├── tsconfig.json
└── README.md
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "astro-htmx",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./middleware": "./dist/middleware.js",
    "./response": "./dist/response.js",
    "./fragment": "./dist/fragment.js",
    "./types": "./dist/types.d.ts"
  },
  "typesVersions": {
    "*": {
      ".": ["dist/index.d.ts"],
      "middleware": ["dist/middleware.d.ts"],
      "response": ["dist/response.d.ts"],
      "fragment": ["dist/fragment.d.ts"]
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "prepublishOnly": "tsc"
  },
  "peerDependencies": {
    "astro": "^5.0.0"
  },
  "devDependencies": {
    "astro": "^5.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true
  },
  "include": ["src"]
}
```

**Step 3: Create integration entry point**

```typescript
// src/index.ts
import type { AstroIntegration } from "astro"

type ErrorNotify = "console" | "alert" | ((status: number, url: string) => void)

interface ErrorHandlingOptions {
  /** Prevent 4xx/5xx responses from being swapped into the DOM (default: true) */
  prevent?: boolean
  /** How to notify the user of errors (default: "console") */
  notify?: ErrorNotify
}

interface AstroHtmxOptions {
  /** Auto-wire CSRF from meta tag (default: false). Unnecessary for PocketBase apps (SameSite=Lax cookies handle CSRF). */
  csrf?: boolean | { metaName?: string }
  /** Error handling for 4xx/5xx responses (default: true — prevents swap + logs to console) */
  errorHandling?: boolean | ErrorHandlingOptions
  /** Re-init Alpine.js after HTMX swaps (default: false) */
  alpineBridge?: boolean
}

export default function astroHtmx(options: AstroHtmxOptions = {}): AstroIntegration {
  const {
    errorHandling = true,
    csrf = false,
    alpineBridge = false,
  } = options

  // Normalise errorHandling to full options object
  const errorOpts: ErrorHandlingOptions | false =
    errorHandling === false ? false :
    errorHandling === true ? { prevent: true, notify: "console" } :
    { prevent: errorHandling.prevent ?? true, notify: errorHandling.notify ?? "console" }

  const csrfMetaName = typeof csrf === "object" ? (csrf.metaName ?? "csrf-token") : "csrf-token"

  return {
    name: "astro-htmx",
    hooks: {
      "astro:config:setup": ({ addMiddleware, injectScript }) => {
        addMiddleware({
          entrypoint: "astro-htmx/middleware",
          order: "pre",
        })

        if (errorOpts) {
          // Build notify expression based on config
          let notifyExpr: string
          if (errorOpts.notify === "alert") {
            notifyExpr = `alert("Request failed: " + status)`
          } else if (errorOpts.notify === "console") {
            notifyExpr = `console.error("HTMX request failed:", status, url)`
          } else {
            // Custom function — will be serialised separately
            notifyExpr = `(${errorOpts.notify.toString()})(status, url)`
          }

          // Guard against duplicate listeners on View Transitions re-runs
          injectScript("page", `
            if (!window.__astroHtmxError) {
              window.__astroHtmxError = true;
              ${errorOpts.prevent ? `
              document.addEventListener("htmx:before:swap", (e) => {
                const status = e.detail.xhr?.status ?? e.detail.response?.status;
                if (status >= 400) {
                  e.preventDefault();
                  const url = e.detail.requestConfig?.path ?? "";
                  const detail = { status, url };
                  document.dispatchEvent(new CustomEvent("astro-htmx:error", { detail }));
                  ${notifyExpr};
                }
              });
              ` : ""}
              document.addEventListener("htmx:error", (e) => {
                const detail = e.detail;
                const status = detail.xhr?.status ?? detail.response?.status;
                const url = detail.requestConfig?.path ?? "";
                if (status) {
                  const hasRedirect = detail.xhr?.getResponseHeader?.("HX-Redirect")
                    ?? detail.response?.headers?.get?.("HX-Redirect");
                  if ((status === 401 || status === 403) && hasRedirect) return;
                  ${notifyExpr};
                } else {
                  console.error("Network error during HTMX request");
                }
              });
            }
          `)
        }

        if (alpineBridge) {
          // Guard against duplicate listeners on View Transitions re-runs
          injectScript("page", `
            if (!window.__astroHtmxAlpine) {
              window.__astroHtmxAlpine = true;
              document.addEventListener("htmx:before:swap", (e) => {
                if (window.Alpine) {
                  Alpine.mutateDom(() => {
                    Alpine.destroyTree(e.detail.target ?? e.detail.elt);
                  });
                }
              });
              document.addEventListener("htmx:after:swap", (e) => {
                if (window.Alpine) {
                  Alpine.mutateDom(() => {
                    Alpine.initTree(e.detail.target ?? e.detail.elt);
                  });
                }
              });
            }
          `)
        }

        if (csrf) {
          // Guard against duplicate listeners on View Transitions re-runs
          injectScript("page", `
            if (!window.__astroHtmxCsrf) {
              window.__astroHtmxCsrf = true;
              document.addEventListener("htmx:config:request", (e) => {
                const meta = document.querySelector('meta[name="${csrfMetaName}"]');
                if (meta) {
                  e.detail.headers["X-CSRF-Token"] = meta.content;
                }
              });
            }
          `)
        }
      },
    },
  }
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with integration entry point"
```

---

## Task 2: Request Parsing Middleware

**Files:**
- Create: `src/middleware.ts`, `src/locals.ts`

**Step 1: Define the HtmxLocals type**

```typescript
// src/locals.ts

export interface HtmxDetails {
  /** True when HX-Request header is present */
  request: boolean
  /** True when HX-Boosted header is present (boosted navigation, not fragment swap) */
  boosted: boolean
  /** True when this is a partial HTMX request (request && !boosted). Use this to conditionally skip layouts. */
  isPartial: boolean
  /** Normalised target ID — strips HTMX 4's "tag#id" prefix, returns plain ID */
  target: string | null
  /** Check if the request targets a specific fragment ID. Handles HTMX 4's "tag#id" format. */
  isTarget: (id: string) => boolean
  /** Source element ID that triggered the request. Reads HX-Source (HTMX 4) with HX-Trigger (HTMX 2) fallback */
  source: string | null
  /** Name attribute of the triggering element */
  triggerName: string | null
  /** User response to hx-confirm prompt */
  prompt: string | null
  /** URL the browser was on when the request was made */
  currentUrl: string | null
  /** True when this is a history restore request */
  historyRestore: boolean
}

/** Parse the HX-Target header, normalising HTMX 4's "tag#id" format to plain "id" */
export function parseTarget(raw: string | null): string | null {
  if (!raw) return null
  const hashIndex = raw.indexOf("#")
  return hashIndex !== -1 ? raw.substring(hashIndex + 1) : raw
}

export function parseHtmxHeaders(request: Request): HtmxDetails {
  const h = (name: string) => request.headers.get(name)
  const isRequest = h("HX-Request") === "true"
  const isBoosted = h("HX-Boosted") === "true"
  const target = parseTarget(h("HX-Target"))

  return {
    request: isRequest,
    boosted: isBoosted,
    isPartial: isRequest && !isBoosted,
    target,
    isTarget: (id: string) => target === id,
    source: h("HX-Source") ?? h("HX-Trigger"),
    triggerName: h("HX-Trigger-Name"),
    prompt: h("HX-Prompt"),
    currentUrl: h("HX-Current-URL"),
    historyRestore: h("HX-History-Restore-Request") === "true",
  }
}
```

**Step 2: Create the middleware**

```typescript
// src/middleware.ts
import { defineMiddleware } from "astro:middleware"
import { parseHtmxHeaders } from "./locals"

export const onRequest = defineMiddleware(async (context, next) => {
  const htmx = parseHtmxHeaders(context.request)
  context.locals.htmx = htmx

  const response = await next()

  // Vary on HX-Request and HX-Boosted so CDN/proxy caches serve correct version
  response.headers.append("Vary", "HX-Request")
  response.headers.append("Vary", "HX-Boosted")

  return response
})
```

**Step 3: Export types for user's env.d.ts**

Users add to their `env.d.ts`:

```typescript
/// <reference types="astro-htmx/types" />
```

Which extends `App.Locals`:

```typescript
// src/types.d.ts
import type { HtmxDetails } from "./locals"

declare global {
  namespace App {
    interface Locals {
      htmx: HtmxDetails
    }
  }
}
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: request parsing middleware with typed Astro.locals.htmx"
```

---

## Task 3: Response Builder

**Files:**
- Create: `src/response.ts`

**Step 1: Build chainable response helpers**

```typescript
// src/response.ts

type SwapStrategy =
  | "innerHTML" | "outerHTML"
  | "innerMorph" | "outerMorph"
  | "beforebegin" | "afterbegin" | "beforeend" | "afterend"
  | "delete" | "none"

/** Swap strategy with optional modifiers (e.g., "innerHTML transition:true scroll:top") */
type SwapValue = SwapStrategy | `${SwapStrategy} ${string}`

/** Chainable HTMX response builder */
export class HtmxResponse {
  private headers: Record<string, string> = {}
  private statusCode = 200

  /** Client-side redirect (HX-Redirect) */
  redirect(url: string) {
    this.headers["HX-Redirect"] = url
    return this
  }

  /** Client-side location change with options (HX-Location) */
  location(url: string | { path: string; target?: string; swap?: string }) {
    this.headers["HX-Location"] = typeof url === "string" ? url : JSON.stringify(url)
    return this
  }

  /** Push URL into browser history (HX-Push-Url) */
  pushUrl(url: string | false) {
    this.headers["HX-Push-Url"] = url === false ? "false" : url
    return this
  }

  /** Replace current URL without pushing (HX-Replace-Url) */
  replaceUrl(url: string | false) {
    this.headers["HX-Replace-Url"] = url === false ? "false" : url
    return this
  }

  /** Override swap method from server (HX-Reswap). Supports HTMX 4 morph swaps. */
  reswap(strategy: SwapValue) {
    this.headers["HX-Reswap"] = strategy
    return this
  }

  /** Override target element from server (HX-Retarget) */
  retarget(selector: string) {
    this.headers["HX-Retarget"] = selector
    return this
  }

  /** Override hx-select from server (HX-Reselect) */
  reselect(selector: string) {
    this.headers["HX-Reselect"] = selector
    return this
  }

  /** Trigger client-side events (HX-Trigger) */
  trigger(events: string | Record<string, unknown>) {
    this.headers["HX-Trigger"] = typeof events === "string" ? events : JSON.stringify(events)
    return this
  }

  /** Trigger events after settle (HX-Trigger-After-Settle) */
  triggerAfterSettle(events: string | Record<string, unknown>) {
    this.headers["HX-Trigger-After-Settle"] = typeof events === "string" ? events : JSON.stringify(events)
    return this
  }

  /** Trigger events after swap (HX-Trigger-After-Swap) */
  triggerAfterSwap(events: string | Record<string, unknown>) {
    this.headers["HX-Trigger-After-Swap"] = typeof events === "string" ? events : JSON.stringify(events)
    return this
  }

  /** Force full page refresh (HX-Refresh) */
  refresh() {
    this.headers["HX-Refresh"] = "true"
    return this
  }

  /** Set HTTP status code */
  status(code: number) {
    this.statusCode = code
    return this
  }

  /** Build a Response with no body (headers only) */
  empty() {
    return new Response(null, {
      status: this.statusCode,
      headers: this.headers,
    })
  }

  /** Build a Response with an HTML body */
  html(body: string) {
    return new Response(body, {
      status: this.statusCode,
      headers: { ...this.headers, "Content-Type": "text/html" },
    })
  }

  /** Apply headers to an existing Response */
  apply(response: Response) {
    for (const [key, value] of Object.entries(this.headers)) {
      response.headers.set(key, value)
    }
    return response
  }
}

/** Create a new HTMX response builder */
export function htmxResponse() {
  return new HtmxResponse()
}

/** Shorthand: redirect response */
export function htmxRedirect(url: string) {
  return new HtmxResponse().redirect(url).empty()
}

/** Shorthand: stop polling (status 286) */
export function htmxStopPolling() {
  return new Response(null, { status: 286 })
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: chainable HTMX response builder with typed swap strategies"
```

---

## Task 4: Fragment Detection Helper

**Files:**
- Create: `src/fragment.ts`

**Step 1: Create standalone fragment detection**

This standalone function is for use outside middleware context (e.g., API endpoints where middleware hasn't run). When middleware has run, prefer `Astro.locals.htmx.isTarget("id")` instead.

```typescript
// src/fragment.ts
import { parseTarget } from "./locals"

/**
 * Check if the current request targets a specific fragment.
 * Returns true when HX-Target matches the given ID.
 * Handles HTMX 4's "tag#id" format transparently.
 *
 * For use outside middleware context (API endpoints).
 * When middleware has run, prefer: Astro.locals.htmx.isTarget("id")
 */
export function isFragmentTarget(request: Request, id: string): boolean {
  const targetId = parseTarget(request.headers.get("HX-Target"))
  return targetId === id
}
```

**Step 2: Document usage patterns**

The README should present three approaches for fragment rendering:

**Approach 1: Astro partials (dedicated fragment pages)**

```astro
---
// src/pages/partials/species-results.astro
export const partial = true

const species = await getSpecies()
---
<div id="species-results">
  <SpeciesGrid species={species} />
  <Pagination />
</div>
```

```html
<button hx-get="/partials/species-results" hx-target="#species-results">
  Load
</button>
```

- Astro-native pattern — `export const partial = true` returns HTML fragments without `<html>` wrapping
- Clean separation: full page in one file, fragment in another
- Best for: dedicated HTMX endpoints, partials reused by multiple triggers

**Approach 2: `hx-select` (client-side, zero effort)**

```html
<!-- The browser fetches the full page and extracts #results client-side -->
<button hx-get="/species" hx-target="#results" hx-select="#results">
  Load
</button>
```

- No server-side changes needed
- Server renders the full page (layout, header, footer, all components)
- Full HTML payload over the wire
- Best for: prototyping, low-traffic pages, simple pages

**Approach 3: `isTarget()` / `isPartial` (server-side, optimised)**

```astro
---
const { htmx } = Astro.locals

// Option A: check specific target
if (htmx.isTarget("species-results")) {
  // Return just the fragment — skip layout
  return Astro.response
}

// Option B: check if any partial request
if (htmx.isPartial) {
  // Skip layout for all HTMX fragment requests (not boosted navigation)
}
---
{htmx.isTarget("species-results") ? (
  <div id="species-results">
    <SpeciesGrid />
    <Pagination />
  </div>
) : (
  <Layout>
    <Header />
    <div id="species-results">
      <SpeciesGrid />
      <Pagination />
    </div>
    <Footer />
  </Layout>
)}
```

- Server skips layout/header/footer rendering for HTMX requests
- Smaller HTML payload over the wire
- Best for: expensive queries, large pages, high traffic

**Future (v0.2):** Automatic fragment extraction via middleware (à la Laravel's `@fragment`) would combine the simplicity of `hx-select` with the performance of server-side extraction. This requires HTML parsing in middleware and is deferred until the approach is proven. OOB swap helpers are also a v0.2 goal — for now, use `hx-swap-oob="true"` directly in Astro templates.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: fragment detection helpers (isTarget, isPartial, isFragmentTarget)"
```

---

## Task 5: Tests

**Files:**
- Create: `tests/locals.test.ts`, `tests/response.test.ts`, `tests/fragment.test.ts`

**Step 1: Set up test runner**

Add `vitest` as a dev dependency and a test script to `package.json`.

**Step 2: Test parseHtmxHeaders, parseTarget, isPartial, isTarget**

```typescript
// tests/locals.test.ts
import { describe, it, expect } from "vitest"
import { parseHtmxHeaders, parseTarget } from "../src/locals"

describe("parseTarget", () => {
  it("returns null for null input", () => {
    expect(parseTarget(null)).toBeNull()
  })

  it("returns plain ID as-is (HTMX 2)", () => {
    expect(parseTarget("results")).toBe("results")
  })

  it("strips tag prefix from HTMX 4 format", () => {
    expect(parseTarget("div#results")).toBe("results")
  })
})

describe("parseHtmxHeaders", () => {
  function makeRequest(headers: Record<string, string>) {
    return new Request("http://localhost", { headers })
  }

  it("detects non-HTMX requests", () => {
    const result = parseHtmxHeaders(makeRequest({}))
    expect(result.request).toBe(false)
    expect(result.isPartial).toBe(false)
  })

  it("parses all HTMX headers", () => {
    const result = parseHtmxHeaders(makeRequest({
      "HX-Request": "true",
      "HX-Boosted": "true",
      "HX-Target": "div#my-target",
      "HX-Trigger": "btn-1",
      "HX-Trigger-Name": "submit",
      "HX-Prompt": "yes",
      "HX-Current-URL": "http://localhost/page",
      "HX-History-Restore-Request": "true",
    }))
    expect(result.request).toBe(true)
    expect(result.boosted).toBe(true)
    expect(result.isPartial).toBe(false) // boosted = not partial
    expect(result.target).toBe("my-target")
    expect(result.source).toBe("btn-1")
    expect(result.triggerName).toBe("submit")
    expect(result.prompt).toBe("yes")
    expect(result.currentUrl).toBe("http://localhost/page")
    expect(result.historyRestore).toBe(true)
  })

  it("prefers HX-Source over HX-Trigger (HTMX 4)", () => {
    const result = parseHtmxHeaders(makeRequest({
      "HX-Request": "true",
      "HX-Source": "new-source",
      "HX-Trigger": "old-trigger",
    }))
    expect(result.source).toBe("new-source")
  })

  it("isPartial is true for non-boosted HTMX requests", () => {
    const result = parseHtmxHeaders(makeRequest({
      "HX-Request": "true",
    }))
    expect(result.isPartial).toBe(true)
  })

  it("isTarget matches normalised target ID", () => {
    const result = parseHtmxHeaders(makeRequest({
      "HX-Request": "true",
      "HX-Target": "div#results",
    }))
    expect(result.isTarget("results")).toBe(true)
    expect(result.isTarget("other")).toBe(false)
  })

  it("isTarget returns false when no target", () => {
    const result = parseHtmxHeaders(makeRequest({
      "HX-Request": "true",
    }))
    expect(result.isTarget("results")).toBe(false)
  })
})
```

**Step 3: Test HtmxResponse builder**

```typescript
// tests/response.test.ts
import { describe, it, expect } from "vitest"
import { HtmxResponse, htmxResponse, htmxRedirect, htmxStopPolling } from "../src/response"

describe("HtmxResponse", () => {
  it("chains multiple headers", () => {
    const res = htmxResponse()
      .retarget("#modal")
      .reswap("innerHTML")
      .trigger("formSaved")
      .html("<p>Done</p>")

    expect(res.headers.get("HX-Retarget")).toBe("#modal")
    expect(res.headers.get("HX-Reswap")).toBe("innerHTML")
    expect(res.headers.get("HX-Trigger")).toBe("formSaved")
    expect(res.headers.get("Content-Type")).toBe("text/html")
  })

  it("supports morph swap strategies", () => {
    const res = htmxResponse().reswap("innerMorph").empty()
    expect(res.headers.get("HX-Reswap")).toBe("innerMorph")
  })

  it("supports swap modifiers", () => {
    const res = htmxResponse().reswap("innerHTML transition:true").empty()
    expect(res.headers.get("HX-Reswap")).toBe("innerHTML transition:true")
  })

  it("sets reselect header", () => {
    const res = htmxResponse().reselect("#content").empty()
    expect(res.headers.get("HX-Reselect")).toBe("#content")
  })

  it("builds empty response with status", () => {
    const res = htmxResponse().status(204).empty()
    expect(res.status).toBe(204)
    expect(res.body).toBeNull()
  })

  it("applies headers to existing response", () => {
    const original = new Response("hello")
    htmxResponse().pushUrl("/new").apply(original)
    expect(original.headers.get("HX-Push-Url")).toBe("/new")
  })
})

describe("htmxRedirect", () => {
  it("returns redirect response", () => {
    const res = htmxRedirect("/dashboard")
    expect(res.headers.get("HX-Redirect")).toBe("/dashboard")
  })
})

describe("htmxStopPolling", () => {
  it("returns 286 status", () => {
    expect(htmxStopPolling().status).toBe(286)
  })
})
```

**Step 4: Test isFragmentTarget (standalone)**

```typescript
// tests/fragment.test.ts
import { describe, it, expect } from "vitest"
import { isFragmentTarget } from "../src/fragment"

describe("isFragmentTarget", () => {
  function makeRequest(target?: string) {
    const headers: Record<string, string> = { "HX-Request": "true" }
    if (target) headers["HX-Target"] = target
    return new Request("http://localhost", { headers })
  }

  it("returns false when no HX-Target", () => {
    expect(isFragmentTarget(makeRequest(), "results")).toBe(false)
  })

  it("matches plain ID (HTMX 2)", () => {
    expect(isFragmentTarget(makeRequest("results"), "results")).toBe(true)
  })

  it("matches tag#id format (HTMX 4)", () => {
    expect(isFragmentTarget(makeRequest("div#results"), "results")).toBe(true)
  })

  it("returns false on mismatch", () => {
    expect(isFragmentTarget(makeRequest("other"), "results")).toBe(false)
  })
})
```

**Step 5: Commit**

```bash
git add -A
git commit -m "test: unit tests for locals, response builder, and fragment detection"
```

---

## Task 6: Documentation + README

**Files:**
- Create: `README.md`

Write a README covering:

- **Requirements:** `output: 'server'` or `'hybrid'` in Astro config
- **Installation:** `bun add astro-htmx`
- **Integration setup** in `astro.config.mjs`
- **`Astro.locals.htmx` API reference:**
  - `request`, `boosted`, `isPartial`, `target`, `isTarget(id)`, `source`, `triggerName`, `prompt`, `currentUrl`, `historyRestore`
  - Note: `source` reads `HX-Source` (HTMX 4) with `HX-Trigger` (HTMX 2) fallback
- **Response builder examples** — including `reselect()` and morph swap strategies (`innerMorph`, `outerMorph`)
- **Fragment rendering:** three approaches — Astro partials, `hx-select`, `isTarget()`/`isPartial`
- **Error handling options:**
  - `errorHandling: true` (default) — prevents swap + console log
  - `errorHandling: { prevent: true, notify: "alert" }` — prevents swap + shows alert
  - `errorHandling: { prevent: false, notify: fn }` — custom handler, no swap prevention
  - `errorHandling: false` — no error handling (use your own)
  - Custom event: `astro-htmx:error` is dispatched with `{ status, url }` detail when swaps are prevented
  - Note: if you have existing error handlers, set `errorHandling: false` to avoid conflicts
- **CSRF option:**
  - Meta tag approach — user renders `<meta name="csrf-token" content="...">`, library reads it via `htmx:config:request` event
  - Configurable meta name: `csrf: { metaName: "my-token" }`
  - Note: unnecessary for PocketBase apps — `SameSite=Lax` cookies handle CSRF
- **Alpine bridge option:**
  - Calls `Alpine.destroyTree()` before swap and `Alpine.initTree()` after swap on the swapped element (not document.body)
  - Wrapped in `Alpine.mutateDom()` for proper cleanup
  - Note: Alpine `$store` state survives swaps (stores are global). Use `$store` for state that must persist across HTMX swaps.
  - Note: `x-init` expressions will re-fire on newly swapped components — avoid side effects in `x-init` for components inside swap targets, or use `Alpine.data()` with guards
- **HTMX 4 compatibility notes:**
  - Target normalisation (`tag#id` → `id`)
  - `HX-Source` → `source` field (with `HX-Trigger` fallback)
  - Event names use HTMX 4 format (colon-separated: `htmx:before:swap`, `htmx:after:swap`)
  - Attribute renames: `hx-disabled-elt` → `hx-disable`, `hx-params` → `hx-include="this"`
  - Explicit inheritance: use `hx-boost:inherited="true"` (not `hx-boost="true"`) for body-level attributes
  - Morph swaps: use `innerMorph`/`outerMorph` to preserve scroll, focus, and Alpine state
- **Alpine.js + HTMX 4 caveat:**
  - Multi-colon HTMX 4 event names (`htmx:after:request`) don't work with Alpine's `@` shorthand
  - Use `x-init` with `$el.addEventListener('htmx:after:request', ...)` instead
- **View Transitions / ClientRouter:**
  - Recommended: don't use `<ClientRouter />` when HTMX handles navigation (`hx-boost`)
  - Alternative: use ClientRouter for full-page navigation (transition animations) + HTMX for partial updates only (no `hx-boost`). Don't use both for navigation — they'll conflict.

**Step 1: Write README**

**Step 2: Commit**

```bash
git add -A
git commit -m "docs: README with full API reference"
```

---

## Task 7: Publish Initial Version

**Step 1: Add build script and publish config**

Ensure `package.json` has `"prepublishOnly": "tsc"` and exports point to `dist/`.

**Step 2: Publish to npm**

```bash
npm publish --access public
```

**Step 3: Update Alkas to use astro-htmx**

Replace manual helpers in Alkas with the package — this validates the API design against a real app.

---

## Resolved Decisions

1. **Fragment rendering** — Three approaches documented: Astro partials (`export const partial = true`), `hx-select`, and `isTarget()`/`isPartial`. Automatic fragment extraction deferred to v0.2.

2. **HTMX 4 header renames** — `source` field reads `HX-Source` (HTMX 4) with `HX-Trigger` (HTMX 2) fallback. Field renamed from `trigger` to `source` to avoid confusion with response `HX-Trigger` header.

3. **CSRF approach** — Uses `htmx:config:request` event listener (not `hx-headers:inherited` attribute) for robustness. Unnecessary for PocketBase apps — documented as such.

4. **Guard helper** — Dropped. Too app-specific (assumed auth shape, hardcoded routes). Users write their own in ~3 lines.

5. **Error handling** — Configurable: `prevent` (swap prevention) and `notify` (`"console"`, `"alert"`, or custom function). Dispatches `astro-htmx:error` custom event. Also listens to `htmx:error` for HTTP and network errors. Default: prevent swap + console log.

6. **Alpine bridge** — Scoped to swapped element (not `document.body`). Uses `Alpine.destroyTree()` before swap and `Alpine.initTree()` after swap, wrapped in `Alpine.mutateDom()`. Documents `$store` for state persistence and `x-init` re-execution caveat.

7. **`isPartial` and `isTarget()`** — Added to `HtmxDetails` locals object. `isPartial` = `request && !boosted`. `isTarget(id)` = `target === id`. Standalone `isFragmentTarget(request, id)` kept for API endpoints outside middleware.

8. **OOB swap support** — Deferred to v0.2. In AHA stack, OOB is handled via `hx-swap-oob="true"` directly in Astro templates — no helper needed for v0.1.

9. **View Transitions** — Documented: recommend disabling ClientRouter when using HTMX for navigation. Alternative: ClientRouter for full-page transitions + HTMX for partials only (no `hx-boost`).

10. **Package exports** — Point to compiled `dist/` output (not `src/` TypeScript). `"./types"` export added for `/// <reference types="astro-htmx/types" />`.

11. **Script deduplication** — All `injectScript("page")` calls use global flags (`window.__astroHtmxError`, etc.) to prevent duplicate event listeners when View Transitions re-run page scripts.

---

## Open Questions

1. **Partial auto-export** — Can the integration automatically add `export const partial = true` to files in `src/pages/partials/` via an Astro hook?

2. **Automatic fragment extraction (v0.2)** — Best mechanism for middleware-based extraction: HTML parsing (linkedom/htmlparser2), regex extraction, or Astro renderer hook?

3. **OOB swap helper (v0.2)** — Response builder method (`.oob("#sidebar", html)`) or standalone utility? Needs to compose well with Astro template rendering.
