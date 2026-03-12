# rails-htmx

**Package:** [guilleiguaran/rails-htmx](https://github.com/guilleiguaran/rails-htmx) | Gem: `rails-htmx`
**Stars:** ~74 | **Status:** Last updated September 2023 | **Author:** Guillermo Iguaran (Rails core team)

## What It Provides

Automatic layout suppression for HTMX requests, redirect handling, and view helpers. The most opinionated library — makes strong assumptions about how you want to handle HTMX.

## Automatic Layout Suppression

The defining feature: when `HX-Request` is present, Rails skips the application layout and returns only the view template content.

```ruby
# No code needed — layout suppression is automatic
class SpeciesController < ApplicationController
  def index
    @species = Species.all
    # For regular requests: renders with application layout
    # For HTMX requests: renders only the view template (no layout)
  end
end
```

## Opting Out

When you need the full layout even for an HTMX request (e.g., boosted navigation):

```ruby
class SessionsController < ApplicationController
  def new
    prevent_htmx!  # Force full layout for this action
  end
end
```

## View Helper

`hx` helper generates HTMX attributes in ERB templates:

```erb
<%= link_to "Load More", species_path, hx: { get: species_path, target: "#grid" } %>
```

## Redirect Handling

Automatically converts 302 redirects to 303 for non-GET/non-POST HTMX requests. This ensures XHR redirects work correctly — browsers change method to GET on 303 but may not on 302.

## Fragment Handling

**Automatic layout suppression IS the fragment strategy.** The assumption is:
- Regular request → full page with layout
- HTMX request → view template only (no `<html>`, `<head>`, `<body>`)

This works well for simple cases but doesn't handle the boosted navigation vs targeted fragment swap distinction that apps like Alkas need.

## HTMX 4 Compatibility

**Not documented.** Last updated September 2023, likely predates HTMX 4 alpha.

## Other Ruby Options

**[bkuhlmann/htmx](https://github.com/bkuhlmann/htmx)** — General Ruby companion (works with Hanami too):
- Attribute building: `HTMX[target: "#grid", delete: "/items/1"]`
- Request parsing with predicate methods: `.boosted?`, `.request?`
- Response header mutation

## Key Takeaways for astro-htmx

- Automatic layout suppression is what Astro's `Layout.astro` already does manually with `isHTMX`
- The `prevent_htmx!` escape hatch maps to our `getHxTargetId()` pattern — sometimes you need layout even for HTMX requests
- Rails' approach is too coarse for apps with both boosted navigation and fragment swaps — it doesn't distinguish between the two
- The redirect 302→303 fix is a useful detail we should consider
