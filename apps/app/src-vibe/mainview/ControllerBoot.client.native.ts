/// <reference types="vite/client" />
// E-7 (EK4402): ControllerBoot's reads of the browser window and its page-lifecycle listeners are
// platform calls VibeLang code does not make. ControllerBoot.client.vibe calls these exactly where
// ControllerBoot.client.ts touches `window` and `import.meta.env`.

/** `window.location`. */
export const entryLocation = (): Location => window.location

/** `window`, for the frame history it hosts. */
export const browserWindow = (): Window => window

/** `import.meta.env.VITE_SMITHERS_REMOTE_CARETS`. */
export const remoteCaretsFlag = (): string | undefined => import.meta.env.VITE_SMITHERS_REMOTE_CARETS

/** `import.meta.env.MODE`. */
export const buildMode = (): string => import.meta.env.MODE

/** `window.history.replaceState(window.history.state, "", url)`. */
export const replaceEntryUrl = (url: string): void => window.history.replaceState(window.history.state, "", url)

/** ControllerBoot.client.ts's page-lifecycle listeners, verbatim. */
export const followPageLifetime = (pageLifetime: AbortController, dispose: () => Promise<void>): void => {
  // Chromium can reject interrupted fetches before pagehide. Fence their
  // observers first; release collections only once the page is hidden.
  window.addEventListener("beforeunload", () => pageLifetime.abort())
  window.addEventListener("pagehide", () => {
    pageLifetime.abort()
    void dispose().catch(() => {})
  })
  // A history-cache restore must reconnect durable work with a fresh scope.
  window.addEventListener("pageshow", event => {
    if (event.persisted && pageLifetime.signal.aborted) window.location.reload()
  })
  // Stop can cancel a navigation after beforeunload without hiding this
  // document. Reconnect its retired scope, unless another page is replacing it.
  type NavigationAttempt = Event & { readonly signal: AbortSignal; readonly destination: { readonly sameDocument: boolean } }
  const navigation = (window as Window & { readonly navigation?: EventTarget }).navigation
  let navigating: NavigationAttempt | undefined
  navigation?.addEventListener("navigate", raw => {
    const attempt = raw as NavigationAttempt
    navigating = attempt
    attempt.signal.addEventListener("abort", () => {
      setTimeout(() => {
        if (pageLifetime.signal.aborted && (navigating === attempt || navigating?.destination.sameDocument)) window.location.reload()
      }, 0)
    }, { once: true })
  })
}
