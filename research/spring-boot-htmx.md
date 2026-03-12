# htmx-spring-boot

**Package:** [wimdeblauwe/htmx-spring-boot](https://github.com/wimdeblauwe/htmx-spring-boot) | Maven: `io.github.wimdeblauwe:htmx-spring-boot`
**Stars:** ~645 | **Status:** Actively maintained | **Endorsed by:** Spring blog, JetBrains

## What It Provides

Annotations, argument resolvers, response helpers, Thymeleaf dialect, CSRF handling, and OOB swap support. The most feature-rich HTMX server library.

## Request API (Annotation-Based)

```java
// Only match HTMX requests
@HxRequest
@GetMapping("/species")
public String speciesFragment(HtmxRequest htmxRequest) {
    htmxRequest.isHtmxRequest();       // boolean
    htmxRequest.isBoosted();            // boolean
    htmxRequest.getTarget();            // Optional<String>
    htmxRequest.getTrigger();           // Optional<String>
    htmxRequest.getTriggerName();       // Optional<String>
    htmxRequest.getCurrentUrl();        // Optional<String>
    htmxRequest.getPrompt();            // Optional<String>
    return "species :: grid";
}

// Match non-HTMX requests — full page
@GetMapping("/species")
public String speciesPage() {
    return "species";
}
```

The `@HxRequest` annotation enables **separate controller methods** for HTMX vs regular requests. Spring's method resolution picks the right one automatically.

## Response API (Annotation-Based)

```java
@HxRequest
@PostMapping("/favourite")
@HxTrigger("favouriteToggled")       // Sets HX-Trigger response header
@HxReswap(HxSwapType.OUTER_HTML)    // Sets HX-Reswap response header
public String toggleFavourite() {
    return "favourite-button :: button";
}
```

## Response Builder (Programmatic)

```java
@HxRequest
@PostMapping("/favourite")
public HtmxResponse toggleFavourite() {
    return HtmxResponse.builder()
        .trigger("favouriteToggled")
        .triggerAfterSwap("refreshCounts")
        .pushUrl("/species/123")
        .reswap(HxSwapType.OUTER_HTML)
        .retarget("#fav-btn")
        .view("favourite-button :: button")
        .build();
}
```

## Fragment / OOB Swap Support

Return multiple fragments in a single response using Spring's `FragmentsRendering`:

```java
@HxRequest
@PostMapping("/favourite")
public FragmentsRendering toggleFavourite() {
    return FragmentsRendering.with("favourite-button :: button")
        .fragment("favourite-count :: count")  // OOB swap
        .build();
}
```

Leverages Spring Framework 6.2's native HTML Fragments support.

## Thymeleaf Dialect

```html
<!-- Use HTMX attributes directly in Thymeleaf -->
<button hx:get="@{/species}" hx:target="#grid" hx:swap="innerHTML">
    Load
</button>
```

## CSRF Handling

**Automatic CSRF token injection** into `hx-headers` for POST/PUT/PATCH/DELETE requests. Also provides native htmx redirect support in Spring Security (prevents the redirect-to-login from being swapped into a fragment target).

## Fragment Handling

**Two approaches:**
1. `@HxRequest` annotation creates separate controller methods for HTMX vs regular requests
2. Thymeleaf fragment selectors (`template :: fragment`) render specific template sections

Both eliminate the manual if/else branching.

## HTMX 4 Compatibility

Active development. v5.0.0 targets Spring Boot 4.0. Removed deprecated annotations in favor of view name prefixes (`refresh:htmx`, `redirect:htmx:/path`).

## Key Takeaways for astro-htmx

- **Annotation-based routing is the most ergonomic approach** — separate handlers for HTMX vs regular, no branching logic
- Automatic CSRF injection is exactly what we do manually in Layout.astro
- OOB swap support (returning multiple fragments) is a power feature worth considering
- Spring Security integration for auth redirects solves the same problem as our `HX-Redirect: /signin` pattern
- The most complete library — covers every use case we've encountered in Alkas
