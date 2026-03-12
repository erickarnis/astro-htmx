# django-htmx

**Package:** [adamchainz/django-htmx](https://github.com/adamchainz/django-htmx) | PyPI: `django-htmx`
**Stars:** ~1,940 | **Contributors:** 30 | **Status:** Actively maintained

## What It Provides

Middleware, request header parsing, response helpers, template tags, and a debug extension.

## Request API

`HtmxMiddleware` attaches an `HtmxDetails` instance to every request:

```python
# Middleware populates request.htmx
if request.htmx:                    # True for any HTMX request
    request.htmx.boosted            # bool — HX-Boosted header present
    request.htmx.current_url        # str | None — HX-Current-URL
    request.htmx.target             # str | None — HX-Target
    request.htmx.trigger            # str | None — HX-Trigger (element ID)
    request.htmx.trigger_name       # str | None — HX-Trigger-Name
    request.htmx.prompt             # str | None — HX-Prompt (hx-confirm value)
    request.htmx.history_restore_request  # bool — HX-History-Restore-Request
    request.htmx.triggering_event   # any — parsed from HX-Triggering-Event (if set)
```

## Response API

```python
from django_htmx.http import HttpResponseStopPolling

# Stop a polling trigger (returns 286)
return HttpResponseStopPolling()

# Client-side redirect (HX-Redirect)
from django_htmx.http import HttpResponseClientRedirect
return HttpResponseClientRedirect("/login/")

# Client-side refresh (HX-Refresh: true)
from django_htmx.http import HttpResponseClientRefresh
return HttpResponseClientRefresh()

# Trigger events — set HX-Trigger header
from django_htmx.http import trigger_client_event
response = render(request, "partial.html")
trigger_client_event(response, "showToast", {"message": "Saved!"})
return response
```

## Template Tags

```html
{% load django_htmx %}

<!-- Vendors htmx 2.0.7 script tag -->
{% django_htmx_script %}
```

## Fragment Handling

**No built-in mechanism.** You check headers manually in views:

```python
def species_list(request):
    context = get_species(request)
    if request.htmx and request.htmx.target == "species-results":
        return render(request, "species/_grid.html", context)
    return render(request, "species/list.html", context)
```

## Debug Extension

Includes a debug error response handler that surfaces 404/500 errors during development by replacing the error body in HTMX responses so you can see them.

## HTMX 4 Compatibility

**Not yet.** Latest version (1.27.0) vendors htmx 2.0.7. The `.target` property would need updating for the `tag#id` format. HTMX 4 also renames some request headers (`HX-Trigger` → `HX-Source`).

## Key Takeaways for astro-htmx

- The `request.htmx` middleware pattern is the gold standard — clean, typed, always available
- Response helpers are straightforward utility classes, not complex
- No fragment rendering — every framework leaves this to the developer
- The debug extension is a good idea (similar to what `astro-htmx-error-overlay` did)
