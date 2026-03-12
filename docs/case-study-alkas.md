# Case Study: Migrating Alkas to astro-htmx

## About Alkas

Alkas is a wildlife discovery and spaced repetition learning platform built with the AHA stack (Astro 5 SSR + HTMX 4 + Alpine.js). It's a full-featured app with 40+ pages, filter/search with fragment swaps, infinite scroll, toggle buttons via partials, a study session state machine, audio players, and modal forms. It runs on Supabase PostgreSQL with Kysely ORM and deploys to Railway.

## What Alkas had before

Before `astro-htmx`, Alkas maintained ~57 lines of hand-rolled HTMX plumbing spread across three files:

**Middleware (`src/middleware.ts`):**
- Manual `HX-Request` header detection → `Astro.locals.isHTMX`
- `Vary: HX-Request` response header

**Layout (`src/layouts/Layout.astro`):**
- `Alpine.initTree(document.body)` in an `htmx:after:swap` listener
- `htmx:error` listener to log HTTP/network errors
- `htmx:before:swap` listener to cancel swaps on 4xx/5xx responses
- Cookie regex to read CSRF token + `hx-headers:inherited` injection

**Helper (`src/lib/htmx.server.ts`):**
- `getHxTargetId()` function to parse HTMX 4's `tag#id` format from the `HX-Target` header
- Imported in 10+ page files for fragment-vs-full-page decisions

## The migration

### What moved to astro-htmx

| Before | After | Lines removed |
|--------|-------|---------------|
| `Astro.locals.isHTMX = request.headers.get("HX-Request") === "true"` | `Astro.locals.htmx.request` (automatic) | 2 |
| `getHxTargetId(Astro.request) === "species-results"` (10 pages) | `htmx.isTarget("species-results")` | 3 per page + 12-line helper file |
| `Vary: HX-Request` in middleware | Automatic | 1 |
| `Alpine.initTree()` in `htmx:after:swap` | `alpineBridge: true` | 3 |
| `htmx:error` + `htmx:before:swap` error handling | `errorHandling: true` | 20 |
| Cookie regex CSRF + `hx-headers:inherited` | `csrf: true` + `<meta name="csrf-token">` | 6 |

**Total: ~57 lines of app code replaced by 3 lines of config.**

### What stayed in Alkas (app-specific)

- CSRF token generation and server-side validation (middleware)
- Auth gate responses (`signInRequiredResponse`, `emailNotVerifiedResponse`, `upgradeRequiredResponse`)
- Audio player initialization and WaveSurfer cleanup
- Umami analytics pageview tracking on boosted navigation
- Progress bar animation (CSS + request counting)
- URL param stripping for clean pushed URLs
- SwipeDeck Alpine component
- All fragment-vs-full-page rendering decisions in pages (using `htmx.isTarget()`)

The boundary is clean: `astro-htmx` handles generic HTMX infrastructure, Alkas owns app-specific behavior.

### The config

```javascript
// astro.config.mjs
astroHtmx({
  errorHandling: true,
  alpineBridge: true,
  csrf: true,
})
```

## What was most valuable

### 1. `htmx.isTarget()` — eliminated the most repetitive boilerplate

Every page that serves both full pages (boosted navigation) and fragments (targeted `hx-get`) had identical boilerplate:

```typescript
// Before — repeated in 10+ pages
import { getHxTargetId } from "@/lib/htmx.server"
const htmxTarget = getHxTargetId(Astro.request)
const isFragmentRequest = htmxTarget === "species-results"
```

```typescript
// After
const { htmx } = Astro.locals
const isFragmentRequest = htmx.isTarget("species-results")
```

Beyond saving lines, this eliminates the HTMX 4 `tag#id` normalization bug that every app would need to handle. HTMX 4 sends `div#species-results` in the `HX-Target` header instead of just `species-results`. Without normalization, `=== "species-results"` silently fails and the app serves full pages where it should serve fragments.

### 2. Alpine bridge — subtle, easy to get wrong

The naive approach (`Alpine.initTree(element)` after swap) works for simple cases but breaks in others. The correct sequence is:

1. `Alpine.destroyTree()` *before* the swap (prevent memory leaks)
2. `Alpine.initTree()` *after* the swap, wrapped in `Alpine.mutateDom()` (prevent double-init)
3. Guard flags to prevent duplicate listeners on View Transitions re-runs

Alkas originally only did step 2. The library handles all three.

### 3. Error handling — identical in every HTMX app

The `htmx:before:swap` handler to cancel error swaps and the `htmx:error` handler for logging are pure boilerplate. They're the same in every app. Having them as a config flag is the right abstraction level.

## What was less useful

### `htmx.boosted` and `htmx.isPartial`

Alkas never uses these. The fragment-vs-full-page decision is always `htmx.isTarget("specific-id")`, not "is this a boosted request?". The `isPartial` shorthand (`request && !boosted`) sounds useful in theory but doesn't map to how the app actually makes rendering decisions.

### `HtmxResponse` builder

Alkas doesn't use it. Toggle buttons render partials (Astro pages that return component HTML), not constructed Response objects. The auth gate helpers (`signInRequiredResponse()`) are app-specific one-liners. A chainable builder would add a layer for no benefit.

The builder would matter more in apps with complex HTMX choreography — retargeting, multiple OOB swaps, conditional reswaps. Alkas's partial-page pattern keeps things simple enough that raw `new Response()` works fine.

### CSRF

This ended up being valuable, but only after Alkas refactored to the meta tag pattern. The library's CSRF assumes `<meta name="csrf-token">` in the HTML, which is the standard pattern (Django, Rails, Laravel). Alkas originally used a double-submit cookie with client-side regex parsing — a valid but non-standard approach that didn't fit the library's API. After switching to meta tags, the library handles CSRF injection automatically and the client-side code is cleaner.

## Lessons for the library

1. **Header parsing is the core value.** `isTarget()` with HTMX 4 normalization saves real bugs and real boilerplate. This alone justifies the library.

2. **Config flags beat code.** Error handling, Alpine bridge, and CSRF are all "write once, identical everywhere" concerns. A boolean flag is the right interface.

3. **The response builder is speculative.** It was built for hypothetical complex use cases. The real-world app (40+ pages, 30+ partials) never needed it. Consider keeping it but not promoting it as a primary feature.

4. **Vary headers need to be customizable.** The initial hardcoded `Vary: HX-Request, HX-Boosted` works for most cases, but apps behind specific CDN configurations need control. Added `vary: string[] | false` option after the migration revealed this gap.

## Numbers

- **Lines removed from Alkas:** ~57
- **Lines added (config):** 3
- **Files deleted:** 1 (`htmx.server.ts`)
- **Files modified:** 17 (middleware, Layout, 10 pages, env.d.ts, config, CLAUDE.md, package.json, lockfile)
- **Net change:** +97 / -93 (most additions are lockfile noise)
- **Client bundle impact:** -0.15 KB (cookie regex JS removed, astro-htmx CSRF script is smaller)
- **Build time impact:** None measurable
