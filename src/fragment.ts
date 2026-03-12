import { parseTarget } from "./locals"

/**
 * Check if the current request targets a specific fragment.
 * Returns true when HX-Target matches the given ID.
 * Handles HTMX 4's "tag#id" format transparently.
 *
 * For use outside middleware context (API endpoints).
 * When middleware has run, prefer: Astro.locals.htmx.isTarget("id")
 */
export function isFragmentTarget(request: Request, id: string): boolean {
  const targetId = parseTarget(request.headers.get("HX-Target"))
  return targetId === id
}
