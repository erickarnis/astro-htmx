import { describe, it, expect } from "vitest"
import { HtmxResponse, htmxResponse, htmxRedirect, htmxStopPolling } from "../src/response"

describe("HtmxResponse", () => {
  it("chains multiple headers", () => {
    const res = htmxResponse()
      .retarget("#modal")
      .reswap("innerHTML")
      .trigger("formSaved")
      .html("<p>Done</p>")

    expect(res.headers.get("HX-Retarget")).toBe("#modal")
    expect(res.headers.get("HX-Reswap")).toBe("innerHTML")
    expect(res.headers.get("HX-Trigger")).toBe("formSaved")
    expect(res.headers.get("Content-Type")).toBe("text/html")
  })

  it("supports morph swap strategies", () => {
    const res = htmxResponse().reswap("innerMorph").empty()
    expect(res.headers.get("HX-Reswap")).toBe("innerMorph")
  })

  it("supports swap modifiers", () => {
    const res = htmxResponse().reswap("innerHTML transition:true").empty()
    expect(res.headers.get("HX-Reswap")).toBe("innerHTML transition:true")
  })

  it("sets reselect header", () => {
    const res = htmxResponse().reselect("#content").empty()
    expect(res.headers.get("HX-Reselect")).toBe("#content")
  })

  it("builds empty response with status", () => {
    const res = htmxResponse().status(204).empty()
    expect(res.status).toBe(204)
    expect(res.body).toBeNull()
  })

  it("applies headers to existing response", () => {
    const original = new Response("hello")
    htmxResponse().pushUrl("/new").apply(original)
    expect(original.headers.get("HX-Push-Url")).toBe("/new")
  })
})

describe("htmxRedirect", () => {
  it("returns redirect response", () => {
    const res = htmxRedirect("/dashboard")
    expect(res.headers.get("HX-Redirect")).toBe("/dashboard")
  })
})

describe("htmxStopPolling", () => {
  it("returns 286 status", () => {
    expect(htmxStopPolling().status).toBe(286)
  })
})
