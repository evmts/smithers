/**
 * The default root IS the launcher (mvp.md M-45, #4041): a first visit opens
 * the app there without pressing anything, so no marketing page stands between
 * a visitor and open, create, explore and the Smithers update news.
 *
 * The press stays the door for a browser running no script and for an import
 * that failed, and `AppEntry.shouldResumeApp` in `@smthrs/rpc` still owns the
 * instant resume an authentication return needs. The site's other pages are
 * pages.
 */
export function opensLauncher(pathname: string): boolean {
  return pathname === "/" || pathname === "/index.html"
}
