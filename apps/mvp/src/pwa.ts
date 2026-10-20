// What the PWA's service worker keeps (vite.config.ts, docs/features/web-pages.md#the-app-around-a-frame): the app's
// own shell, and nothing else. Nothing here imports a library, so the build config can.

/** What Workbox hands a runtime route's matcher about one request. */
export interface ShellRequest {
  readonly url: URL
  readonly sameOrigin: boolean
  readonly request: { readonly method: string; readonly destination: string }
}

/**
 * Whether the service worker keeps `request` in its shell cache, network first: a `GET` of the app's own origin
 * outside `/api/`, for a module a reload needs offline. Never a frame's document: an outside page `app/web/open`
 * embeds is another origin's, which this worker never sees, and a frame of the app itself is refused
 * (`frame-ancestors 'none'`), so neither is cached or answered from the shell.
 */
export const shellCaches = ({ url, sameOrigin, request }: ShellRequest): boolean =>
  sameOrigin && request.method === "GET" && request.destination !== "iframe" && !url.pathname.startsWith("/api/")

/**
 * The headers every page of the app is served with: it refuses to be framed by any page, its own included. An outside
 * page in a frame may redirect it anywhere, the app's own origin too, and a frame on the app's origin with
 * `allow-scripts allow-same-origin` could remove its own sandbox (docs/features/web-pages.md#security).
 */
export const PAGE_HEADERS = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
} as const

/**
 * The policy index.html sets for what the app frames: only `https:` pages (`app/web/open`'s `embed`), so a frame of
 * `javascript:`, `data:`, `blob:`, `file:` or `http:` never loads, whatever reaches the page.
 */
export const FRAME_POLICY = "frame-src https:"
