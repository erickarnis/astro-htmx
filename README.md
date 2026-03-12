# astro-htmx

Typed HTMX integration for Astro — request parsing, response helpers, fragment detection, and sensible defaults.

**Requires:** `output: 'server'` or `'hybrid'` in your Astro config. Middleware, request headers, and dynamic responses all require SSR.

## Installation

```bash
bun add astro-htmx
```

## Setup

**1. Add the integration:**

```js
// astro.config.mjs
import { defineConfig } from "astro/config"
import astroHtmx from "astro-htmx"

export default defineConfig({
  output: "server",
  integrations: [astroHtmx()],
})
```

**2. Add type augmentation:**

```typescript
// src/env.d.ts
/// <reference types="astro/client" />
/// <reference types="astro-htmx/types" />
```

## `Astro.locals.htmx`

The middleware automatically parses HTMX request headers and exposes them on `Astro.locals.htmx`:

| Property | Type | Description |
|---|---|---|
| `request` | `boolean` | `HX-Request` header present |
| `boosted` | `boolean` | `HX-Boosted` header present (boosted navigation) |
| `isPartial` | `boolean` | `request && !boosted` — true for fragment swaps, false for boosted navigation |
| `target` | `string \| null` | Normalised target ID (strips HTMX 4's `tag#id` prefix) |
| `isTarget(id)` | `(id: string) => boolean` | Check if request targets a specific element |
| `source` | `string \| null` | Source element ID — reads `HX-Source` (HTMX 4) with `HX-Trigger` (HTMX 2) fallback |
| `triggerName` | `string \| null` | `HX-Trigger-Name` — name attribute of triggering element |
| `prompt` | `string \| null` | `HX-Prompt` — user response to `hx-confirm` |
| `currentUrl` | `string \| null` | `HX-Current-URL` — browser URL when request was made |
| `historyRestore` | `boolean` | `HX-History-Restore-Request` — history restore request |

```astro
---
const { htmx } = Astro.locals

if (htmx.isPartial) {
  // Skip layout for HTMX fragment requests
}

if (htmx.isTarget("species-results")) {
  // Render only the targeted fragment
}
---
```

## Response Builder

Chainable response helpers for setting HTMX response headers:

```typescript
import { htmxResponse, htmxRedirect, htmxStopPolling } from "astro-htmx/response"

// Chainable builder
return htmxResponse()
  .retarget("#modal")
  .reswap("innerHTML")
  .trigger("formSaved")
  .html("<p>Saved!</p>")

// Redirect
return htmxRedirect("/dashboard")

// Stop polling (status 286)
return htmxStopPolling()

// Apply headers to existing response
htmxResponse().pushUrl("/new").apply(response)
```

### Builder Methods

| Method | Header | Description |
|---|---|---|
| `.redirect(url)` | `HX-Redirect` | Client-side redirect |
| `.location(url)` | `HX-Location` | Location change with options |
| `.pushUrl(url)` | `HX-Push-Url` | Push URL to browser history |
| `.replaceUrl(url)` | `HX-Replace-Url` | Replace current URL |
| `.reswap(strategy)` | `HX-Reswap` | Override swap method |
| `.retarget(selector)` | `HX-Retarget` | Override target element |
| `.reselect(selector)` | `HX-Reselect` | Override `hx-select` |
| `.trigger(events)` | `HX-Trigger` | Trigger client-side events |
| `.triggerAfterSettle(events)` | `HX-Trigger-After-Settle` | Trigger after settle |
| `.triggerAfterSwap(events)` | `HX-Trigger-After-Swap` | Trigger after swap |
| `.refresh()` | `HX-Refresh` | Force full page refresh |
| `.status(code)` | — | Set HTTP status code |
| `.empty()` | — | Build Response with no body |
| `.html(body)` | — | Build Response with HTML body |
| `.apply(response)` | — | Apply headers to existing Response |

### Swap Strategies

The `.reswap()` method accepts HTMX 4 morph strategies in addition to standard swaps:

```typescript
htmxResponse().reswap("innerMorph")  // Morph inner content (preserves focus, scroll, Alpine state)
htmxResponse().reswap("outerMorph")  // Morph entire element
htmxResponse().reswap("innerHTML transition:true scroll:top")  // With modifiers
```

## Fragment Rendering

Three approaches for serving HTMX fragments:

### Approach 1: Astro Partials (recommended)

Dedicated fragment pages using Astro's native partial support:

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

### Approach 2: `hx-select` (zero effort)

Client-side extraction — no server changes needed:

```html
<button hx-get="/species" hx-target="#results" hx-select="#results">
  Load
</button>
```

Server renders the full page; HTMX extracts the targeted element client-side. Full HTML over the wire, but no server-side code needed.

### Approach 3: `isTarget()` / `isPartial` (optimised)

Server-side conditional rendering for smaller payloads:

```astro
---
const { htmx } = Astro.locals
---
{htmx.isTarget("species-results") ? (
  <div id="species-results">
    <SpeciesGrid />
  </div>
) : (
  <Layout>
    <Header />
    <div id="species-results">
      <SpeciesGrid />
    </div>
    <Footer />
  </Layout>
)}
```

### Standalone Fragment Detection

For API endpoints outside middleware context:

```typescript
import { isFragmentTarget } from "astro-htmx/fragment"

export async function GET({ request }: APIContext) {
  if (isFragmentTarget(request, "results")) {
    return new Response("<div>Fragment</div>", {
      headers: { "Content-Type": "text/html" },
    })
  }
}
```

## Options

```js
astroHtmx({
  errorHandling: true,   // default — prevent swap + console log
  csrf: false,           // default — disabled
  alpineBridge: false,   // default — disabled
})
```

### Error Handling

Prevents 4xx/5xx responses from being swapped into the DOM and notifies the user.

```js
// Default: prevent swap + console log
astroHtmx({ errorHandling: true })

// Prevent swap + show alert
astroHtmx({ errorHandling: { prevent: true, notify: "alert" } })

// Custom handler, no swap prevention
astroHtmx({ errorHandling: { prevent: false, notify: (status, url) => {
  showToast(`Error ${status} on ${url}`)
} } })

// Disable entirely (use your own handlers)
astroHtmx({ errorHandling: false })
```

When swaps are prevented, an `astro-htmx:error` custom event is dispatched on `document` with `{ status, url }` detail. If the server responds with `HX-Redirect` on 401/403, the error handler steps aside to allow the redirect.

### CSRF

Auto-wires CSRF tokens from a `<meta>` tag into HTMX request headers:

```js
astroHtmx({ csrf: true })
// or with custom meta name:
astroHtmx({ csrf: { metaName: "my-csrf-token" } })
```

Reads `<meta name="csrf-token" content="...">` and adds `X-CSRF-Token` to every HTMX request via `htmx:config:request`.

> **Note:** Unnecessary for PocketBase apps — `SameSite=Lax` cookies handle CSRF.

### Alpine.js Bridge

Re-initialises Alpine.js components after HTMX swaps:

```js
astroHtmx({ alpineBridge: true })
```

Calls `Alpine.destroyTree()` before swap and `Alpine.initTree()` after swap on the swapped element, wrapped in `Alpine.mutateDom()` for proper cleanup.

- `Alpine.$store` state survives swaps (stores are global) — use `$store` for state that must persist
- `x-init` expressions re-fire on swapped components — avoid side effects in `x-init` for swap targets, or use `Alpine.data()` with guards

## HTMX 4 Compatibility

This library is built for HTMX 4 with HTMX 2 backwards compatibility:

- **Target normalisation:** `tag#id` → `id` (transparent)
- **`HX-Source`** → `source` field (with `HX-Trigger` fallback for HTMX 2)
- **Event names:** Uses HTMX 4 colon-separated format (`htmx:before:swap`, `htmx:after:swap`)
- **Morph swaps:** `innerMorph` / `outerMorph` preserve scroll, focus, and Alpine state
- **Attribute renames:** `hx-disabled-elt` → `hx-disable`, `hx-params` → `hx-include="this"`
- **Explicit inheritance:** Use `hx-boost:inherited="true"` (not `hx-boost="true"`) for body-level attributes

### Alpine.js + HTMX 4 Caveat

Multi-colon HTMX 4 event names (`htmx:after:request`) don't work with Alpine's `@` shorthand. Use `x-init` with `$el.addEventListener('htmx:after:request', ...)` instead.

## View Transitions / ClientRouter

**Recommended:** Don't use `<ClientRouter />` when HTMX handles navigation (`hx-boost`).

**Alternative:** Use ClientRouter for full-page navigation (transition animations) + HTMX for partial updates only (no `hx-boost`). Don't use both for navigation — they'll conflict.
