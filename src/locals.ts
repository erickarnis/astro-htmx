export interface HtmxDetails {
  /** True when HX-Request header is present */
  request: boolean
  /** True when HX-Boosted header is present (boosted navigation, not fragment swap) */
  boosted: boolean
  /** True when this is a partial HTMX request (request && !boosted). Use this to conditionally skip layouts. */
  isPartial: boolean
  /** Normalised target ID — strips HTMX 4's "tag#id" prefix, returns plain ID */
  target: string | null
  /** Check if the request targets a specific fragment ID. Handles HTMX 4's "tag#id" format. */
  isTarget: (id: string) => boolean
  /** Source element ID that triggered the request. Reads HX-Source (HTMX 4) with HX-Trigger (HTMX 2) fallback */
  source: string | null
  /** Name attribute of the triggering element */
  triggerName: string | null
  /** User response to hx-confirm prompt */
  prompt: string | null
  /** URL the browser was on when the request was made */
  currentUrl: string | null
  /** True when this is a history restore request */
  historyRestore: boolean
}

/** Parse the HX-Target header, normalising HTMX 4's "tag#id" format to plain "id" */
export function parseTarget(raw: string | null): string | null {
  if (!raw) return null
  const hashIndex = raw.indexOf("#")
  return hashIndex !== -1 ? raw.substring(hashIndex + 1) : raw
}

export function parseHtmxHeaders(request: Request): HtmxDetails {
  const h = (name: string) => request.headers.get(name)
  const isRequest = h("HX-Request") === "true"
  const isBoosted = h("HX-Boosted") === "true"
  const target = parseTarget(h("HX-Target"))

  return {
    request: isRequest,
    boosted: isBoosted,
    isPartial: isRequest && !isBoosted,
    target,
    isTarget: (id: string) => target === id,
    source: h("HX-Source") ?? h("HX-Trigger"),
    triggerName: h("HX-Trigger-Name"),
    prompt: h("HX-Prompt"),
    currentUrl: h("HX-Current-URL"),
    historyRestore: h("HX-History-Restore-Request") === "true",
  }
}
