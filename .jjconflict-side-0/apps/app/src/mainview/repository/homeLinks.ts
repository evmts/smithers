/**
 * Where a declared home link opens (repo-ui-spec view 1): the app's own pages
 * in place, any other site in a new tab. Own means an origin-relative path
 * (the schema admits `/bug`, never `//host`) or an absolute URL on this page's
 * origin: Platform's home.json writes `https://smithers.sh/bug` (the targets
 * DSL's Url requires https), which on smithers.sh is the app's own page.
 * CodeHome's links and the chat-side DeclaredBlocks both read this.
 */
export const opensInPlace = (url: string, here: string | undefined = typeof window === "undefined" ? undefined : window.location.href): boolean => {
  // Positive, not "anything that is not http": only an origin-relative path (never `//host` or `/\host`) or an http(s) URL qualifies.
  if (/^\/(?![/\\])/.test(url)) return true
  if (!/^https?:/i.test(url) || here === undefined) return false
  try { return new URL(url, here).origin === new URL(here).origin } catch { return false }
}
