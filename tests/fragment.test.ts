import { describe, it, expect } from "vitest"
import { isFragmentTarget } from "../src/fragment"

describe("isFragmentTarget", () => {
  function makeRequest(target?: string) {
    const headers: Record<string, string> = { "HX-Request": "true" }
    if (target) headers["HX-Target"] = target
    return new Request("http://localhost", { headers })
  }

  it("returns false when no HX-Target", () => {
    expect(isFragmentTarget(makeRequest(), "results")).toBe(false)
  })

  it("matches plain ID (HTMX 2)", () => {
    expect(isFragmentTarget(makeRequest("results"), "results")).toBe(true)
  })

  it("matches tag#id format (HTMX 4)", () => {
    expect(isFragmentTarget(makeRequest("div#results"), "results")).toBe(true)
  })

  it("returns false on mismatch", () => {
    expect(isFragmentTarget(makeRequest("other"), "results")).toBe(false)
  })
})
