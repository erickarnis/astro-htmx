# astro-htmx Library Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an Astro integration that provides typed HTMX request parsing, response helpers, automatic fragment rendering, and sensible defaults for Astro + HTMX apps.

**Architecture:** Astro integration that auto-configures middleware for request parsing, exports response helpers and an `<HtmxFragment>` component, and optionally injects client-side error handling and CSRF wiring.

**Tech Stack:** Astro 5+, TypeScript, HTMX 4 (with HTMX 2 backwards compatibility)

---

## Design Principles

Based on research of django-htmx, htmx-go, laravel-htmx, rails-htmx, and htmx-spring-boot:

1. **Middleware parses, locals expose.** Every library attaches parsed headers to the request object. We use `Astro.locals.htmx`.
2. **Response helpers are chainable.** Consensus across Go, Laravel, Spring Boot. One builder, many methods.
3. **Fragment rendering is the killer feature.** Laravel's `@fragment` directive is the pattern to beat. Our `<HtmxFragment>` component brings this to Astro.
4. **HTMX 4 native, HTMX 2 compatible.** Normalise `tag#id` → `id` transparently. Handle both event naming conventions.
5. **Zero config for common patterns.** CSRF, error handling, Alpine re-init should be opt-in defaults, not boilerplate.

---

## Feature Comparison: What Exists vs What We Build

| Feature | django | go | laravel | rails | spring | **astro-htmx** |
|---------|--------|----|---------|-------|--------|----------------|
| Request header parsing | Yes | Yes | Yes | No | Yes | **Yes** |
| Typed locals object | Yes | Constants | Yes | No | Yes | **Yes** |
| Response builder | Basic | Chainable | Chainable | No | Chainable + Annotations | **Chainable** |
| Fragment rendering | No | No | `@fragment` | Auto layout skip | `@HxRequest` routing | **`<HtmxFragment>`** |
| CSRF auto-wiring | No | No | No | No | Yes | **Yes** |
| Error swap prevention | Debug only | No | No | No | No | **Yes** |
| Alpine re-init | N/A | N/A | N/A | N/A | N/A | **Yes** |
| Partial page guards | No | No | No | No | No | **Yes** |
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
│   ├── fragment.ts            # Fragment detection logic
│   ├── client.ts              # Client-side script (error handling, Alpine bridge, CSRF)
│   ├── HtmxFragment.astro     # Fragment boundary component
│   └── guard.ts               # Partial page guard helper
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
    ".": "./src/index.ts",
    "./middleware": "./src/middleware.ts",
    "./response": "./src/response.ts",
    "./fragment": "./src/HtmxFragment.astro",
    "./guard": "./src/guard.ts"
  },
  "files": ["src"],
  "peerDependencies": {
    "astro": "^5.0.0"
  },
  "devDependencies": {
    "astro": "^5.0.0",
    "typescript": "^5.7.0"
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

interface AstroHtmxOptions {
  csrf?: boolean          // Auto-wire CSRF token (default: false)
  errorHandling?: boolean // Prevent 4xx/5xx swaps (default: true)
  alpineBridge?: boolean  // Re-init Alpine after swaps (default: false)
}

export default function astroHtmx(options: AstroHtmxOptions = {}): AstroIntegration {
  const { errorHandling = true, csrf = false, alpineBridge = false } = options

  return {
    name: "astro-htmx",
    hooks: {
      "astro:config:setup": ({ addMiddleware, injectScript }) => {
        addMiddleware({
          entrypoint: "astro-htmx/middleware",
          order: "pre",
        })

        if (errorHandling) {
          injectScript("page", `
            document.addEventListener("htmx:before:swap", (e) => {
              const status = e.detail.xhr?.status ?? e.detail.response?.status;
              if (status >= 400) e.preventDefault();
            });
          `)
        }

        if (alpineBridge) {
          injectScript("page", `
            document.addEventListener("htmx:after:swap", () => {
              if (window.Alpine) window.Alpine.initTree(document.body);
            });
          `)
        }

        if (csrf) {
          injectScript("page", `
            const token = document.cookie.match(/csrf_token=([^;]+)/)?.[1];
            if (token) {
              document.body.setAttribute("hx-headers:inherited", JSON.stringify({ "X-CSRF-Token": token }));
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
  /** Normalised target ID — strips HTMX 4's "tag#id" prefix, returns plain ID */
  target: string | null
  /** Element ID that triggered the request */
  trigger: string | null
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

  return {
    request: h("HX-Request") === "true",
    boosted: h("HX-Boosted") === "true",
    target: parseTarget(h("HX-Target")),
    trigger: h("HX-Trigger"),
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

  // Vary on HX-Request so CDN/proxy caches serve correct version
  response.headers.append("Vary", "HX-Request")

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

  /** Override swap method from server (HX-Reswap) */
  reswap(strategy: string) {
    this.headers["HX-Reswap"] = strategy
    return this
  }

  /** Override target element from server (HX-Retarget) */
  retarget(selector: string) {
    this.headers["HX-Retarget"] = selector
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
git commit -m "feat: chainable HTMX response builder"
```

---

## Task 4: HtmxFragment Component

**Files:**
- Create: `src/HtmxFragment.astro`, `src/fragment.ts`

**Step 1: Create fragment detection logic**

```typescript
// src/fragment.ts

/**
 * Check if the current request targets a specific fragment.
 * Returns true when HX-Target matches the given ID.
 */
export function isFragmentTarget(request: Request, id: string): boolean {
  const raw = request.headers.get("HX-Target")
  if (!raw) return false
  const hashIndex = raw.indexOf("#")
  const targetId = hashIndex !== -1 ? raw.substring(hashIndex + 1) : raw
  return targetId === id
}
```

**Step 2: Create HtmxFragment component**

```astro
---
// src/HtmxFragment.astro
import { isFragmentTarget } from "./fragment"

interface Props {
  /** The ID of the fragment container — must match the hx-target on requesting elements */
  id: string
  /** HTML tag for the container element (default: "div") */
  tag?: string
}

const { id, tag: Tag = "div" } = Astro.props
const isFragment = isFragmentTarget(Astro.request, id)

// When this fragment is the target of an HTMX request, Astro's Layout
// will render the full page but only this component's output matters.
// The component always renders its container div with the correct ID.
---

<Tag {id}>
  <slot />
</Tag>
```

The magic happens at the page level. Instead of manual if/else branching:

```astro
---
// BEFORE: manual fragment detection in every page
const htmxTarget = getHxTargetId(Astro.request)
const isFragment = htmxTarget === "species-results"
---
{isFragment ? (
  <Fragment><!-- grid only --></Fragment>
) : (
  <Layout><!-- full page --></Layout>
)}
```

```astro
---
// AFTER: HtmxFragment handles it
import HtmxFragment from "astro-htmx/fragment"
---
<Layout>
  <Header />
  <HtmxFragment id="species-results">
    <SpeciesGrid />
    <Pagination />
  </HtmxFragment>
  <Footer />
</Layout>
```

**Note:** This requires the Layout to detect when a fragment is being targeted and skip the `<html>/<head>` wrapper. The integration's middleware can set a flag (`locals.htmx.fragmentTarget`) that Layout checks. The implementation details of how Layout short-circuits will need to be worked out — this may require an Astro middleware that intercepts the response and extracts just the fragment, similar to how Laravel's `@fragment` works.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: HtmxFragment component for automatic fragment rendering"
```

---

## Task 5: Partial Page Guard

**Files:**
- Create: `src/guard.ts`

**Step 1: Create guard helper**

```typescript
// src/guard.ts

interface GuardOptions {
  /** Require authentication (default: true) */
  auth?: boolean
  /** Allowed HTTP method (default: "POST") */
  method?: string
  /** Redirect URL for unauthenticated users (default: "/signin") */
  signinUrl?: string
}

interface GuardResult {
  user: App.Locals["user"]
  formData: FormData
}

/**
 * Guard a partial page endpoint.
 * Validates method, checks auth, parses form data.
 * Returns a Response on failure, or { user, formData } on success.
 */
export async function guardPartial(
  astro: { request: Request; locals: App.Locals },
  options: GuardOptions = {}
): Promise<Response | GuardResult> {
  const { auth = true, method = "POST", signinUrl = "/signin" } = options

  if (astro.request.method !== method) {
    return new Response(null, { status: 405 })
  }

  if (auth && !astro.locals.user) {
    return new Response(null, {
      status: 200,
      headers: { "HX-Redirect": signinUrl },
    })
  }

  const formData = await astro.request.formData()
  return { user: astro.locals.user, formData }
}

/** Type guard to check if guardPartial returned an error Response */
export function isGuardError(result: Response | GuardResult): result is Response {
  return result instanceof Response
}
```

Usage in partials:

```astro
---
export const partial = true
import { guardPartial, isGuardError } from "astro-htmx/guard"

const result = await guardPartial(Astro)
if (isGuardError(result)) return result

const { user, formData } = result
const taxonId = parseInt(formData.get("taxonId") as string)
// ... toggle logic
---
<FavouriteButton ... />
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: partial page guard helper"
```

---

## Task 6: Documentation + README

**Files:**
- Create: `README.md`

Write a README covering:
- Installation (`bun add astro-htmx`)
- Integration setup in `astro.config.mjs`
- `Astro.locals.htmx` API reference
- Response builder examples
- `<HtmxFragment>` usage
- `guardPartial()` usage
- Options (csrf, errorHandling, alpineBridge)
- HTMX 4 compatibility notes

**Step 1: Write README**

**Step 2: Commit**

```bash
git add -A
git commit -m "docs: README with full API reference"
```

---

## Task 7: Publish Initial Version

**Step 1: Add build script and publish config**

**Step 2: Publish to npm**

```bash
npm publish --access public
```

**Step 3: Update Alkas to use astro-htmx**

Replace manual helpers in Alkas with the package — this validates the API design against a real app.

---

## Open Questions

1. **Fragment extraction mechanism** — How does `<HtmxFragment>` actually extract just its content from the full page render? Options:
   - Middleware intercepts the response HTML, parses it, extracts the fragment by ID
   - A custom Astro renderer that short-circuits rendering when a fragment target is detected
   - Keep the manual if/else pattern and just provide `isFragmentTarget()` as a simpler helper

2. **HTMX 4 header renames** — HTMX 4 renames `HX-Trigger` (request) to `HX-Source`. Should we support both and normalise?

3. **OOB swap support** — Spring Boot supports returning multiple fragments. Should we support this via a `<HtmxOOB>` component?

4. **Partial auto-export** — Can the integration automatically add `export const partial = true` to files in `src/pages/partials/` via an Astro hook?
