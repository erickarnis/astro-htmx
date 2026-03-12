// Virtual module declarations for Astro integration
// These are resolved by Astro's build system at runtime
declare module "astro:middleware" {
  export function defineMiddleware(
    fn: (
      context: import("astro").APIContext,
      next: () => Promise<Response>,
    ) => Promise<Response> | Response,
  ): typeof fn
}

declare module "virtual:astro-htmx/config" {
  export const varyHeaders: string[]
}
