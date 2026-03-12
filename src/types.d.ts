import type { HtmxDetails } from "./locals"

declare global {
  namespace App {
    interface Locals {
      htmx: HtmxDetails
    }
  }
}
