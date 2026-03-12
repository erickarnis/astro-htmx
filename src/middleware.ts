import { defineMiddleware } from "astro:middleware"
import { parseHtmxHeaders } from "./locals"

export const onRequest = defineMiddleware(async (context, next) => {
  const htmx = parseHtmxHeaders(context.request)
  context.locals.htmx = htmx

  const response = await next()

  // Vary on HX-Request and HX-Boosted so CDN/proxy caches serve correct version
  response.headers.append("Vary", "HX-Request")
  response.headers.append("Vary", "HX-Boosted")

  return response
})
