# Alkas → astro-htmx Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Alkas's hand-rolled HTMX helpers with the `astro-htmx` library to validate the library's API against a real app.

**Architecture:** Install `astro-htmx` as a dependency, add the integration to Astro config, then migrate middleware, locals, response helpers, and Layout.astro event handlers to use the library. The library handles: request parsing → `locals.htmx`, error handling, Alpine bridge. Alkas keeps: CSRF (cookie-based, not meta tag), auth gate responses, `htmx-helpers.ts`/`htmx-schemas.ts` (app-specific), all custom event listeners (audio, analytics, loading, param stripping).

**Tech Stack:** Astro 5, HTMX 4, Alpine.js, astro-htmx

---

## What Migrates vs What Stays

### Migrates to astro-htmx

| Current | Replacement |
|---------|-------------|
| `context.locals.isHTMX` (middleware.ts:35-36) | `context.locals.htmx.request` |
| `getHxTargetId(request)` (htmx.server.ts) | `Astro.locals.htmx.target` / `htmx.isTarget("id")` |
| `Vary: HX-Request` header (middleware.ts:93) | Library middleware handles this (adds both `HX-Request` and `HX-Boosted`) |
| `htmx:error` listener (Layout.astro:393-405) | `errorHandling: true` (default) |
| `htmx:before:swap` error prevention (Layout.astro:408-414) | `errorHandling: { prevent: true }` (default) |
| `Alpine.initTree(document.body)` after swap (Layout.astro:269-270) | `alpineBridge: true` |
| Manual `new Response(null, { headers: { "HX-Redirect": url } })` | `htmxRedirect(url)` (optional — low priority) |
| `Astro.response.headers.set("HX-Trigger", ...)` | `htmxResponse().trigger(...).apply(Astro.response)` (optional — low priority) |

### Stays in Alkas (app-specific)

| Pattern | Reason |
|---------|--------|
| CSRF cookie validation (csrf.server.ts) | Cookie-based, not meta tag — different mechanism than library's |
| CSRF `hx-headers:inherited` wiring (Layout.astro:261-264) | Reads from cookie, not meta tag |
| `signInRequiredResponse()` / `emailNotVerifiedResponse()` / `upgradeRequiredResponse()` | App-specific gate modal triggers |
| `htmx-helpers.ts` / `htmx-schemas.ts` | App-specific Valibot validation |
| Audio player init/cleanup (Layout.astro:269-271, 312-325, 328-390) | App-specific WaveSurfer logic |
| Umami pageview tracking (Layout.astro:281-285) | App-specific analytics |
| Loading progress bar (Layout.astro:288-309) | App-specific UX |
| Param stripping (Layout.astro:417-432) | App-specific URL cleaning |
| `responseHeaders` locals pattern (middleware.ts:38-39, 88-90) | Auth cookie propagation |

---

## Task 1: Install astro-htmx and Add Integration

**Files:**
- Modify: `alkas/package.json`
- Modify: `alkas/astro.config.mjs`
- Modify: `alkas/src/env.d.ts`

**Step 1: Install astro-htmx**

Run from the Alkas project directory. Since astro-htmx isn't published to npm yet, install from the local path:

```bash
bun add ../astro-htmx
```

If this doesn't work (symlink issues with Astro integrations), copy the dist:

```bash
mkdir -p node_modules/astro-htmx
cp -r ../astro-htmx/dist ../astro-htmx/package.json node_modules/astro-htmx/
```

**Step 2: Add integration to astro.config.mjs**

```js
import icon from "astro-icon"
import honoAstro from "hono-astro-adapter"
import tailwindcss from "@tailwindcss/vite"
import astroTypesafeRoutes from "astro-typesafe-routes"
import astroHtmx from "astro-htmx"
import { defineConfig } from "astro/config"

export default defineConfig({
  output: "server",
  adapter: honoAstro(),
  integrations: [icon(), astroTypesafeRoutes(), astroHtmx({
    errorHandling: true,
    alpineBridge: true,
    csrf: false,          // Alkas uses cookie-based CSRF, not meta tag
  })],
  vite: {
    plugins: [tailwindcss()],
  },
})
```

**Step 3: Add type reference to env.d.ts**

Add this line after the existing reference:

```typescript
/// <reference types="astro-htmx/types" />
```

This augments `App.Locals` with `htmx: HtmxDetails`. The existing `isHTMX: boolean` stays until Task 3 removes it.

**Step 4: Verify the app starts**

```bash
bun run dev
```

Expected: App starts without errors. The astro-htmx middleware now runs before Alkas's middleware, so `context.locals.htmx` is available.

**Step 5: Commit**

```bash
git add package.json astro.config.mjs src/env.d.ts bun.lock
git commit -m "feat: add astro-htmx integration"
```

---

## Task 2: Migrate Layout.astro — Remove Hand-Rolled Event Listeners

The library now handles error prevention, error logging, and Alpine re-init. Remove those listeners from Layout.astro but keep all app-specific listeners (audio, analytics, loading, param stripping).

**Files:**
- Modify: `alkas/src/layouts/Layout.astro`

**Step 1: Remove the `getHxTargetId` import and usage**

Replace:
```astro
import { getHxTargetId } from "@/lib/htmx.server"
```
```astro
const isHTMX = Astro.locals.isHTMX
const htmxTarget = getHxTargetId(Astro.request)
const includeGates = !htmxTarget && !Astro.locals.user
const includeUpgrade = !htmxTarget && !!Astro.locals.user
```

With:
```astro
const { htmx } = Astro.locals
const includeGates = !htmx.target && !Astro.locals.user
const includeUpgrade = !htmx.target && !!Astro.locals.user
```

And replace the template condition:
```astro
{isHTMX ? (
```
With:
```astro
{htmx.request ? (
```

**Step 2: Remove error handling listeners (lines 392-414)**

Delete these blocks — the library handles them:

```js
// HTMX error handling (htmx 4 unified error event)
document.addEventListener("htmx:error", (event: Event) => { ... })

// Prevent error responses (4xx/5xx) from swapping error text into the DOM
document.addEventListener("htmx:before:swap", (event: Event) => { ... })
```

**Step 3: Replace Alpine.initTree in htmx:after:swap**

The library handles `Alpine.initTree` and `Alpine.destroyTree`. But the `htmx:after:swap` listener also does audio player init and screen reader announcements. Keep those, remove the Alpine line.

Replace:
```js
document.addEventListener("htmx:after:swap", () => {
    Alpine.initTree(document.body)
    initAudioPlayers(document.body)
    // Announce completion for screen readers
    const statusEl = document.getElementById("htmx-status")
    if (statusEl) {
        statusEl.textContent = "Content loaded"
        setTimeout(() => { statusEl.textContent = "" }, 1000)
    }
})
```

With:
```js
document.addEventListener("htmx:after:swap", () => {
    initAudioPlayers(document.body)
    // Announce completion for screen readers
    const statusEl = document.getElementById("htmx-status")
    if (statusEl) {
        statusEl.textContent = "Content loaded"
        setTimeout(() => { statusEl.textContent = "" }, 1000)
    }
})
```

**Step 4: Verify app works**

```bash
bun run dev
```

Test in browser:
- Navigate with hx-boost — full page loads correctly
- Click an HTMX-triggered action — fragments swap correctly
- Trigger an error (e.g., visit a broken endpoint) — error is logged to console, not swapped into DOM
- Alpine components work after HTMX swaps

**Step 5: Commit**

```bash
git add src/layouts/Layout.astro
git commit -m "refactor: use astro-htmx for error handling and Alpine bridge in Layout"
```

---

## Task 3: Migrate Middleware — Remove Manual HTMX Parsing

**Files:**
- Modify: `alkas/src/middleware.ts`
- Modify: `alkas/src/env.d.ts`

**Step 1: Remove `isHTMX` from middleware**

Delete these lines from middleware.ts:
```ts
const isHTMX = context.request.headers.get("HX-Request") === "true"
context.locals.isHTMX = isHTMX
```

And delete the `Vary` header line (the library sets this):
```ts
response.headers.set("Vary", "HX-Request")
```

**Step 2: Remove `isHTMX` from App.Locals**

In `env.d.ts`, remove:
```ts
isHTMX: boolean
```

The library's type augmentation provides `htmx: HtmxDetails` instead.

**Step 3: Verify no remaining references to `isHTMX`**

Search the codebase:
```bash
rg "isHTMX" src/
```

Expected: No results. If any remain, update them to `Astro.locals.htmx.request`.

**Step 4: Commit**

```bash
git add src/middleware.ts src/env.d.ts
git commit -m "refactor: remove manual HTMX header parsing from middleware (now in astro-htmx)"
```

---

## Task 4: Migrate Pages — Replace `getHxTargetId` with `locals.htmx`

10 pages import `getHxTargetId` from `@/lib/htmx.server`. Replace all of them with `Astro.locals.htmx.target` or `htmx.isTarget("id")`.

**Files:**
- Modify: `src/pages/explore/species.astro`
- Modify: `src/pages/explore/decks.astro`
- Modify: `src/pages/explore/places.astro`
- Modify: `src/pages/leaderboard.astro`
- Modify: `src/pages/feedback/index.astro`
- Modify: `src/pages/species/[taxonId]/calls.astro`
- Modify: `src/pages/u/[username]/observed.astro`
- Modify: `src/pages/u/[username]/calls.astro`
- Modify: `src/pages/u/[username]/photos.astro`
- Modify: `src/pages/u/[username]/favourites.astro`
- Delete: `src/lib/htmx.server.ts`

**Step 1: Replace in each page**

The pattern in every page is the same. Remove the import:
```ts
import { getHxTargetId } from "@/lib/htmx.server"
```

Replace the header parsing:
```ts
const htmxTarget = getHxTargetId(Astro.request)
```

With destructured locals (merge with existing `Astro.locals` destructuring if present):
```ts
const { htmx } = Astro.locals
```

Then replace all `htmxTarget === "some-id"` checks with `htmx.isTarget("some-id")`.

**Example: leaderboard.astro**

Before:
```ts
import { getHxTargetId } from "@/lib/htmx.server"
const htmxTarget = getHxTargetId(Astro.request)
const isFragmentRequest = htmxTarget === "leaderboard-content"
```

After:
```ts
const { htmx } = Astro.locals
const isFragmentRequest = htmx.isTarget("leaderboard-content")
```

**Example: explore/species.astro**

Before:
```ts
import { getHxTargetId } from "@/lib/htmx.server"
const htmxTarget = getHxTargetId(Astro.request)
const isExploreContentRequest = htmxTarget === "explore-content"
const isSpeciesResultsRequest = htmxTarget === "species-results"
const isFragmentRequest = isExploreContentRequest || isSpeciesResultsRequest
```

After:
```ts
const { htmx } = Astro.locals
const isExploreContentRequest = htmx.isTarget("explore-content")
const isSpeciesResultsRequest = htmx.isTarget("species-results")
const isFragmentRequest = isExploreContentRequest || isSpeciesResultsRequest
```

**Step 2: Apply the same pattern to all 10 pages**

Each follows the same transformation. Read each file, find the `getHxTargetId` import and usage, replace with `htmx.isTarget()`.

**Step 3: Delete htmx.server.ts**

```bash
rm src/lib/htmx.server.ts
```

This file only exported `getHxTargetId`, which is now replaced by `locals.htmx.target` / `htmx.isTarget()`.

**Step 4: Verify no remaining references**

```bash
rg "htmx.server" src/
rg "getHxTargetId" src/
```

Expected: No results.

**Step 5: Verify app works**

```bash
bun run dev
```

Test fragment rendering on a page that uses `isTarget()` (e.g., leaderboard tabs, explore species filters).

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: replace getHxTargetId with Astro.locals.htmx.isTarget()"
```

---

## Task 5: Migrate Auth Response Helpers (Optional — Low Priority)

The auth helpers in `auth.server.ts` manually construct `Response` objects with `HX-Trigger` headers. These could use `htmxResponse()` but the current code is clear and concise — this is a taste call.

**Files:**
- Modify: `alkas/src/lib/auth.server.ts` (lines 122-147)

**Before:**
```ts
export function signInRequiredResponse(reason?: string) {
  return new Response(null, {
    status: 204,
    headers: {
      "HX-Trigger": JSON.stringify({ "show-gate": { gate: "sign_in", reason } }),
    },
  })
}
```

**After:**
```ts
import { htmxResponse } from "astro-htmx/response"

export function signInRequiredResponse(reason?: string) {
  return htmxResponse()
    .trigger({ "show-gate": { gate: "sign_in", reason } })
    .status(204)
    .empty()
}
```

Same pattern for `emailNotVerifiedResponse()` and `upgradeRequiredResponse()`.

**Also applicable to:** `api/deck.ts` (HX-Redirect), partials that set `HX-Trigger` or `HX-Refresh` directly. These are all optional — the manual approach is fine and arguably more explicit.

**Decision:** Skip this task unless the manual Response construction feels noisy after the other migrations. The library's response builder adds the most value in complex cases (chaining multiple headers). Simple single-header responses are fine as-is.

---

## Task 6: Verify Alpine Bridge Scoping

**Important difference:** The library's `alpineBridge` scopes `Alpine.initTree()` to the swapped element (`e.detail.target ?? e.detail.elt`), but Alkas currently calls `Alpine.initTree(document.body)`.

The comment in Layout.astro explains why:
> Always use document.body because after boosted navigation the triggering element (detail.elt) is detached from the DOM

**Step 1: Test boosted navigation**

With `alpineBridge: true`, test:
1. Click a boosted link (e.g., navigate between pages)
2. Verify Alpine components on the new page work (dropdowns, modals, x-data components)

If Alpine components break after boosted navigation, the library's scoped `initTree` is too narrow.

**Step 2: If scoped init fails — fix in astro-htmx**

Update `src/index.ts` in astro-htmx to use `document.body` for the after-swap init:

```js
document.addEventListener("htmx:after:swap", (e) => {
  if (window.Alpine) {
    Alpine.mutateDom(() => {
      Alpine.initTree(document.body);
    });
  }
});
```

This matches what Alkas already does and is safer for boosted navigation. The `destroyTree` before swap can stay scoped to the element being replaced.

**Step 3: If scoped init works — document the difference**

Note in astro-htmx README that boosted navigation may need `document.body` scope, and update if needed.

---

## Task 7: Final Verification

**Step 1: Full test pass**

```bash
bun run build
```

Expected: No type errors, successful build.

**Step 2: Manual smoke test**

Test these flows in the browser:
- [ ] Boosted navigation (click links) — page loads, Alpine components work
- [ ] Fragment swap (leaderboard tabs, explore filters) — correct fragment renders
- [ ] Auth gate (click action while signed out) — sign-in modal appears
- [ ] Error handling (trigger 4xx/5xx) — error logged, not swapped into DOM
- [ ] Audio players work after HTMX swap
- [ ] CSRF still works on POST/DELETE actions

**Step 3: Commit final state**

```bash
git add -A
git commit -m "refactor: complete astro-htmx migration"
```

---

## Migration Summary

| Before | After | Lines Removed |
|--------|-------|---------------|
| `context.locals.isHTMX = ...` | Library middleware | ~2 |
| `getHxTargetId(request)` × 10 pages | `htmx.isTarget("id")` | ~20 (import + usage per file) |
| `htmx.server.ts` (12 lines) | Deleted | 12 |
| Error handler (13 lines) | `errorHandling: true` | 13 |
| Swap prevention (7 lines) | `errorHandling: { prevent: true }` | 7 |
| `Alpine.initTree` after swap (1 line) | `alpineBridge: true` | 1 |
| `Vary: HX-Request` (1 line) | Library middleware | 1 |
| `isHTMX` type declaration (1 line) | `/// <reference types="astro-htmx/types" />` | 1 |
| **Total** | | **~57 lines removed** |

Net: ~57 lines removed from Alkas, replaced by 3 lines of config in `astro.config.mjs`. The CSRF, auth gates, audio players, analytics, and loading bar remain app-specific.
