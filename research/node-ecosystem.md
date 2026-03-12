# Node.js / Express / Astro Ecosystem

**The gap:** Unlike Django, Laravel, Rails, Go, and Spring Boot, the Node.js ecosystem has **no established HTMX server-side helper library**.

## What Exists

### express-htmx (npm)

**Package:** `express-htmx` | ~1 weekly download | Last release over a year ago

Provides basic Express middleware:

```javascript
const { htmx } = require("express-htmx")

app.use(htmx.middleware)

app.get("/species", (req, res) => {
    if (req.isHtmx()) {
        // ...
    }
})
```

Essentially abandoned. Not a real option.

### Manual patterns (what everyone does)

Most Node.js/HTMX developers read headers directly:

```typescript
// Express
const isHtmx = req.headers["hx-request"] === "true"
const target = req.headers["hx-target"]

// Astro
const isHtmx = Astro.request.headers.get("HX-Request") === "true"
const target = Astro.request.headers.get("HX-Target")
```

## Why the Gap Exists

1. **Framework fragmentation** — Express, Fastify, Hono, Koa, Astro, SvelteKit, Next.js, Remix, Nuxt all handle requests differently. A single package can't target them all ergonomically.
2. **HTMX + React/Vue/Svelte is uncommon** — most Node.js web apps use client-side rendering. HTMX pairs better with server-rendered HTML (Django, Rails, Go templates).
3. **Astro is the exception** — SSR-first, HTML-centric, component-based. It's the best Node.js framework for HTMX but has no dedicated integration.

## What Alkas Does Today

Our custom helpers in the Alkas codebase fill this gap:

- `src/lib/htmx.server.ts` — `getHxTargetId()` for HTMX 4 HX-Target normalisation
- `src/middleware.ts` — Sets `Astro.locals.isHTMX` from HX-Request header
- `src/layouts/Layout.astro` — Conditional layout (full page vs fragment), CSRF injection, error handling, Alpine re-init
- `src/pages/partials/*.astro` — Toggle button pattern with `export const partial = true`

This is ~80 lines of custom code that every Astro + HTMX app would need to write.

## Flask-htmx (for comparison)

**Package:** [edmondchuc/flask-htmx](https://github.com/edmondchuc/flask-htmx) | ~23 stars

Similar ecosystem position to what `astro-htmx` would fill — small framework, minimal but useful:

```python
from flask_htmx import HTMX
htmx = HTMX(app)

@app.route("/species")
def species():
    if htmx:                          # True for HTMX requests
        return render_template("_grid.html")
    return render_template("list.html")
```

## Key Takeaways for astro-htmx

- **Greenfield opportunity** — no competition in the Astro + HTMX space
- The Node.js gap means there's also no Express/Hono/Fastify equivalent to compete with or draw users from
- Astro's unique architecture (SSR components, middleware, partial pages) enables features that generic Node packages can't offer
- The "AHA stack" (Astro + HTMX + Alpine.js) is a growing pattern that needs first-class tooling
