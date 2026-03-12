import type { AstroIntegration } from "astro"

type ErrorNotify = "console" | "alert" | ((status: number, url: string) => void)

interface ErrorHandlingOptions {
  /** Prevent 4xx/5xx responses from being swapped into the DOM (default: true) */
  prevent?: boolean
  /** How to notify the user of errors (default: "console") */
  notify?: ErrorNotify
}

interface AstroHtmxOptions {
  /** Auto-wire CSRF from meta tag (default: false). Unnecessary for PocketBase apps (SameSite=Lax cookies handle CSRF). */
  csrf?: boolean | { metaName?: string }
  /** Error handling for 4xx/5xx responses (default: true — prevents swap + logs to console) */
  errorHandling?: boolean | ErrorHandlingOptions
  /** Re-init Alpine.js after HTMX swaps (default: false) */
  alpineBridge?: boolean
}

export default function astroHtmx(options: AstroHtmxOptions = {}): AstroIntegration {
  const {
    errorHandling = true,
    csrf = false,
    alpineBridge = false,
  } = options

  // Normalise errorHandling to full options object
  const errorOpts: ErrorHandlingOptions | false =
    errorHandling === false ? false :
    errorHandling === true ? { prevent: true, notify: "console" } :
    { prevent: errorHandling.prevent ?? true, notify: errorHandling.notify ?? "console" }

  const csrfMetaName = typeof csrf === "object" ? (csrf.metaName ?? "csrf-token") : "csrf-token"

  return {
    name: "astro-htmx",
    hooks: {
      "astro:config:setup": ({ addMiddleware, injectScript }) => {
        addMiddleware({
          entrypoint: "astro-htmx/middleware",
          order: "pre",
        })

        if (errorOpts) {
          // Build notify expression based on config
          const notify = errorOpts.notify ?? "console"
          let notifyExpr: string
          if (notify === "alert") {
            notifyExpr = `alert("Request failed: " + status)`
          } else if (notify === "console") {
            notifyExpr = `console.error("HTMX request failed:", status, url)`
          } else {
            // Custom function — will be serialised separately
            notifyExpr = `(${notify.toString()})(status, url)`
          }

          // Guard against duplicate listeners on View Transitions re-runs
          injectScript("page", `
            if (!window.__astroHtmxError) {
              window.__astroHtmxError = true;
              ${errorOpts.prevent ? `
              document.addEventListener("htmx:before:swap", (e) => {
                const status = e.detail.xhr?.status ?? e.detail.response?.status;
                if (status >= 400) {
                  e.preventDefault();
                  const url = e.detail.requestConfig?.path ?? "";
                  const detail = { status, url };
                  document.dispatchEvent(new CustomEvent("astro-htmx:error", { detail }));
                  ${notifyExpr};
                }
              });
              ` : ""}
              document.addEventListener("htmx:error", (e) => {
                const detail = e.detail;
                const status = detail.xhr?.status ?? detail.response?.status;
                const url = detail.requestConfig?.path ?? "";
                if (status) {
                  const hasRedirect = detail.xhr?.getResponseHeader?.("HX-Redirect")
                    ?? detail.response?.headers?.get?.("HX-Redirect");
                  if ((status === 401 || status === 403) && hasRedirect) return;
                  ${notifyExpr};
                } else {
                  console.error("Network error during HTMX request");
                }
              });
            }
          `)
        }

        if (alpineBridge) {
          // Guard against duplicate listeners on View Transitions re-runs
          injectScript("page", `
            if (!window.__astroHtmxAlpine) {
              window.__astroHtmxAlpine = true;
              document.addEventListener("htmx:before:swap", (e) => {
                if (window.Alpine) {
                  Alpine.mutateDom(() => {
                    Alpine.destroyTree(e.detail.target ?? e.detail.elt);
                  });
                }
              });
              document.addEventListener("htmx:after:swap", (e) => {
                if (window.Alpine) {
                  Alpine.mutateDom(() => {
                    Alpine.initTree(e.detail.target ?? e.detail.elt);
                  });
                }
              });
            }
          `)
        }

        if (csrf) {
          // Guard against duplicate listeners on View Transitions re-runs
          injectScript("page", `
            if (!window.__astroHtmxCsrf) {
              window.__astroHtmxCsrf = true;
              document.addEventListener("htmx:config:request", (e) => {
                const meta = document.querySelector('meta[name="${csrfMetaName}"]');
                if (meta) {
                  e.detail.headers["X-CSRF-Token"] = meta.content;
                }
              });
            }
          `)
        }
      },
    },
  }
}
