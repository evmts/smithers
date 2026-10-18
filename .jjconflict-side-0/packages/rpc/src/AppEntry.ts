/**
 * Which arrivals at a Smithers web host ask to enter the app.
 *
 * The site's landing page resumes the app at once for one of them, and the
 * app's front door counts one as a return, not a referral. The module reads
 * only the query string it is given, so both the landing page's first script
 * and the app load it without a schema library.
 *
 * @since 1.0.0
 */

/**
 * Whether a visit is an explicit request to enter the app: the tutorial link
 * (`?tutorial`) or an authentication return (`?signed-in=…`, `?auth=failed`,
 * `?auth=error`). Saved data alone is not one. `writerTakeover` is an explicit
 * writer takeover, which enters without either marker.
 *
 * @since 1.0.0
 * @category predicates
 */
export function shouldResumeApp(search: string, writerTakeover = false): boolean {
  const params = new URLSearchParams(search)
  return writerTakeover || params.has("tutorial") || params.has("signed-in") || params.get("auth") === "failed" ||
    params.get("auth") === "error"
}
