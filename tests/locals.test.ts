import { describe, it, expect } from "vitest"
import { parseHtmxHeaders, parseTarget } from "../src/locals"

describe("parseTarget", () => {
  it("returns null for null input", () => {
    expect(parseTarget(null)).toBeNull()
  })

  it("returns plain ID as-is (HTMX 2)", () => {
    expect(parseTarget("results")).toBe("results")
  })

  it("strips tag prefix from HTMX 4 format", () => {
    expect(parseTarget("div#results")).toBe("results")
  })
})

describe("parseHtmxHeaders", () => {
  function makeRequest(headers: Record<string, string>) {
    return new Request("http://localhost", { headers })
  }

  it("detects non-HTMX requests", () => {
    const result = parseHtmxHeaders(makeRequest({}))
    expect(result.request).toBe(false)
    expect(result.isPartial).toBe(false)
  })

  it("parses all HTMX headers", () => {
    const result = parseHtmxHeaders(makeRequest({
      "HX-Request": "true",
      "HX-Boosted": "true",
      "HX-Target": "div#my-target",
      "HX-Trigger": "btn-1",
      "HX-Trigger-Name": "submit",
      "HX-Prompt": "yes",
      "HX-Current-URL": "http://localhost/page",
      "HX-History-Restore-Request": "true",
    }))
    expect(result.request).toBe(true)
    expect(result.boosted).toBe(true)
    expect(result.isPartial).toBe(false) // boosted = not partial
    expect(result.target).toBe("my-target")
    expect(result.source).toBe("btn-1")
    expect(result.triggerName).toBe("submit")
    expect(result.prompt).toBe("yes")
    expect(result.currentUrl).toBe("http://localhost/page")
    expect(result.historyRestore).toBe(true)
  })

  it("prefers HX-Source over HX-Trigger (HTMX 4)", () => {
    const result = parseHtmxHeaders(makeRequest({
      "HX-Request": "true",
      "HX-Source": "new-source",
      "HX-Trigger": "old-trigger",
    }))
    expect(result.source).toBe("new-source")
  })

  it("isPartial is true for non-boosted HTMX requests", () => {
    const result = parseHtmxHeaders(makeRequest({
      "HX-Request": "true",
    }))
    expect(result.isPartial).toBe(true)
  })

  it("isTarget matches normalised target ID", () => {
    const result = parseHtmxHeaders(makeRequest({
      "HX-Request": "true",
      "HX-Target": "div#results",
    }))
    expect(result.isTarget("results")).toBe(true)
    expect(result.isTarget("other")).toBe(false)
  })

  it("isTarget returns false when no target", () => {
    const result = parseHtmxHeaders(makeRequest({
      "HX-Request": "true",
    }))
    expect(result.isTarget("results")).toBe(false)
  })
})
