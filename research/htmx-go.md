# htmx-go

**Package:** [angelofallars/htmx-go](https://github.com/angelofallars/htmx-go) | `github.com/angelofallars/htmx-go`
**Stars:** ~400+ | **Status:** Maintained

## What It Provides

Type-safe request header reading, declarative response header building, trigger helpers, and swap strategy builders. Works with any Go HTTP framework via standard `net/http` types.

## Request API

```go
import "github.com/angelofallars/htmx-go"

func handler(w http.ResponseWriter, r *http.Request) {
    htmx.IsHTMX(r)       // bool — HX-Request header present
    htmx.IsBoosted(r)    // bool — HX-Boosted header present

    // Read specific headers via constants
    target := r.Header.Get(htmx.HeaderTarget)       // HX-Target
    trigger := r.Header.Get(htmx.HeaderTrigger)      // HX-Trigger
    currentURL := r.Header.Get(htmx.HeaderCurrentURL) // HX-Current-URL
}
```

Header constants provided for all HTMX request headers: `HeaderBoosted`, `HeaderRequest`, `HeaderTarget`, `HeaderTrigger`, `HeaderTriggerName`, `HeaderPrompt`, `HeaderHistoryRestoreRequest`, `HeaderCurrentURL`.

## Response API

Chainable response builder:

```go
response := htmx.NewResponse().
    Reswap(htmx.SwapInnerHTML).
    Retarget("#notifications").
    PushURL("/new-url").
    AddTrigger(htmx.NewTrigger().
        Add("showToast").
        AddDetail("formSaved", map[string]string{"message": "Success"}),
    )

// Apply to http.ResponseWriter
response.Write(w)
```

## Swap Strategies

Type-safe swap constants:

```go
htmx.SwapInnerHTML      // innerHTML
htmx.SwapOuterHTML      // outerHTML
htmx.SwapBeforeBegin    // beforebegin
htmx.SwapAfterBegin     // afterbegin
htmx.SwapBeforeEnd      // beforeend
htmx.SwapAfterEnd       // afterend
htmx.SwapDelete         // delete
htmx.SwapNone           // none
```

## Templ Integration

Direct rendering of `templ` components:

```go
response := htmx.NewResponse()
response.RenderTempl(ctx, w, myComponent(data))
```

## Fragment Handling

**No built-in mechanism.** You check `htmx.IsHTMX(r)` and branch manually:

```go
if htmx.IsHTMX(r) {
    tmpl.ExecuteTemplate(w, "species-grid", data)
} else {
    tmpl.ExecuteTemplate(w, "species-page", data)
}
```

## Other Go Options

- **[donseba/go-htmx](https://github.com/donseba/go-htmx)** — Middleware-focused with `io.Writer` support
- **[mavolin/go-htmx](https://github.com/mavolin/go-htmx)** — Middleware-based header management with overwrite support

## HTMX 4 Compatibility

**Not yet.** Header constants would need updating for htmx 4 changes.

## Key Takeaways for astro-htmx

- Chainable response builder pattern is ergonomic — better than individual function calls
- Type-safe swap constants prevent typos (though less valuable in TypeScript with string literals)
- Header constants approach is simple but less ergonomic than a parsed object
- `templ` integration is the Go equivalent of what we need for Astro component rendering
