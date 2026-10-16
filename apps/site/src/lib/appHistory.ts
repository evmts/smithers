/**
 * An explicit entry request resumes the app at once, before this page paints:
 * the tutorial link and every authentication return. Saved data alone is not
 * one of those; `opensLauncher` below owns the default root's own entry.
 */
export function shouldResumeApp(search: string, writerTakeover = false): boolean {
  const params = new URLSearchParams(search)
  return writerTakeover || params.has("tutorial") || params.has("signed-in") || params.get("auth") === "failed" || params.get("auth") === "error"
}

/**
 * The default root IS the launcher (mvp.md M-45, #4041): a first visit opens
 * the app there without pressing anything, so no marketing page stands between
 * a visitor and open, create, explore and the Smithers update news.
 *
 * The press stays the door for a browser running no script and for an import
 * that failed, and `shouldResumeApp` above still owns the instant resume an
 * authentication return needs. The site's other pages are pages.
 */
export function opensLauncher(pathname: string): boolean {
  return pathname === "/" || pathname === "/index.html"
}
