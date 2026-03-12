# laravel-htmx

**Package:** [mauricius/laravel-htmx](https://github.com/mauricius/laravel-htmx) | Packagist: `mauricius/laravel-htmx`
**Stars:** ~356 | **Installs:** ~69,410 | **Status:** Maintained (supports Laravel 9-12)

## What It Provides

Request header parsing, response helpers, custom response classes, and **built-in Blade fragment rendering** — the most complete fragment solution of any HTMX server library.

## Request API

```php
use Mauricius\LaravelHtmx\Http\HtmxRequest;

public function index(HtmxRequest $request) {
    $request->isHtmxRequest();     // bool
    $request->isBoosted();          // bool
    $request->getCurrentUrl();      // string|null
    $request->getTarget();          // string|null
    $request->getTriggerName();     // string|null
    $request->getPrompt();          // string|null
}
```

## Response API

```php
use Mauricius\LaravelHtmx\Http\HtmxResponse;

return with(new HtmxResponse())
    ->location("/new-url")
    ->pushUrl("/push-this")
    ->replaceUrl("/replace-this")
    ->reswap("outerHTML")
    ->retarget("#target")
    ->addTrigger("myEvent")
    ->addTriggerAfterSettle("settleEvent")
    ->addTriggerAfterSwap("swapEvent");
```

Custom response classes:

```php
use Mauricius\LaravelHtmx\Http\HtmxResponseClientRedirect;
use Mauricius\LaravelHtmx\Http\HtmxResponseClientRefresh;
use Mauricius\LaravelHtmx\Http\HtmxResponseStopPolling;

return new HtmxResponseClientRedirect("/login");
return new HtmxResponseClientRefresh();
return new HtmxResponseStopPolling();
```

## Fragment Rendering (Unique Feature)

Blade `@fragment` / `@endfragment` directives mark sections of a template that can be rendered independently:

```blade
{{-- species/list.blade.php --}}
<html>
<body>
    <h1>Species</h1>
    @fragment('species-grid')
        <div id="species-grid">
            @foreach($species as $s)
                <div>{{ $s->name }}</div>
            @endforeach
        </div>
    @endfragment
</body>
</html>
```

Server returns only the fragment for HTMX requests:

```php
public function index(HtmxRequest $request) {
    $species = Species::all();

    if ($request->isHtmxRequest()) {
        return HtmxResponse::renderFragment(
            'species.list',
            'species-grid',
            ['species' => $species]
        );
    }

    return view('species.list', ['species' => $species]);
}
```

**This eliminates the need for separate partial templates.** The fragment is defined once in the full page template and extracted automatically.

Note: Laravel itself now natively supports `@fragment` in Blade — the library pioneered the pattern.

## HTMX 4 Compatibility

**Not documented.** Latest version is 0.9.0.

## Key Takeaways for astro-htmx

- **Fragment rendering is the standout feature** — this is the pattern our `<HtmxFragment>` component idea maps to
- The `@fragment` directive approach proves the concept: define the fragment boundary in the full page, extract automatically for HTMX requests
- Response builder with chainable methods is the consensus API shape across all libraries
- Custom response classes (redirect, refresh, stop polling) are cleaner than raw header manipulation
