type SwapStrategy =
  | "innerHTML" | "outerHTML"
  | "innerMorph" | "outerMorph"
  | "beforebegin" | "afterbegin" | "beforeend" | "afterend"
  | "delete" | "none"

/** Swap strategy with optional modifiers (e.g., "innerHTML transition:true scroll:top") */
type SwapValue = SwapStrategy | `${SwapStrategy} ${string}`

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

  /** Override swap method from server (HX-Reswap). Supports HTMX 4 morph swaps. */
  reswap(strategy: SwapValue) {
    this.headers["HX-Reswap"] = strategy
    return this
  }

  /** Override target element from server (HX-Retarget) */
  retarget(selector: string) {
    this.headers["HX-Retarget"] = selector
    return this
  }

  /** Override hx-select from server (HX-Reselect) */
  reselect(selector: string) {
    this.headers["HX-Reselect"] = selector
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
