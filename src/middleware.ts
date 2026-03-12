import { defineMiddleware } from "astro:middleware"
import { parseHtmxHeaders } from "./locals"
// @ts-ignore — resolved by Vite virtual module plugin at runtime
import { varyHeaders } from "virtual:astro-htmx/config"

export const onRequest = defineMiddleware(async (context, next) => {
  const htmx = parseHtmxHeaders(context.request)
  context.locals.htmx = htmx

  const response = await next()

  for (const header of varyHeaders) {
    response.headers.append("Vary", header)
  }

  return response
})
