/**
 * The GitHub-shaped paths a repository URL carries, parsed once for both hosts.
 *
 * Someone who swaps `github.com` for `smithers.sh` keeps the whole path, not
 * only `/owner/repo`: a pull request, one of its tabs, the pull request list,
 * the issue list, one issue. Two readers decide what such a path means — the
 * Worker edge, which picks the document a path is served from
 * (apps/server/src/appDocument.ts), and the app, which opens the subject after
 * its repository admission (apps/app/src/mainview/RepoLink.ts) — and they must
 * agree exactly: a path the edge serves as the application but the app cannot
 * open is a blank page, and a path the app would open but the edge answers
 * with the marketing 404 is the production failure this grammar exists to fix
 * ([#4039](https://github.com/smithersai/smithers/issues/4039)).
 *
 * So the grammar lives here, once, and each host keeps only the part that is
 * its own: the edge applies GitHub's slug rule and its reserved site segments,
 * the app applies its repository-name rule. Nothing here is decoded —
 * `%70ull` is not `pull` — so an encoded segment can never widen the shape.
 * @since 1.0.0
 */

/**
 * The one subject a GitHub-shaped repository path names.
 *
 * `pull` carries the tab the URL asks for; GitHub's own conversation URL is
 * the bare `/pull/N`, and the three view suffixes are its other tabs, which
 * are exactly the app's four (`prs.tab`). A branch or blob path is NOT here:
 * dividing a slash-bearing ref from a file path needs an authoritative ref
 * resolver, so those paths stay unsupported rather than guessed.
 * @since 1.0.0
 * @category models
 */
export type RepositorySubject =
  | { readonly kind: "pull"; readonly number: number; readonly tab: "conversation" | "commits" | "checks" | "files" }
  | { readonly kind: "pulls" }
  | { readonly kind: "issue"; readonly number: number }
  | { readonly kind: "issues" }

/**
 * The largest subject number a path may name. GitHub numbers issues and pull
 * requests from one in a shared sequence, and a 32-bit signed maximum is past
 * anything a tracker has reached; a longer run of digits is a malformed URL,
 * not a subject, so it is refused here instead of overflowing into a float.
 * @since 1.0.0
 * @category constants
 */
export const REPOSITORY_SUBJECT_NUMBER_MAX = 2147483647

/** A positive decimal with no sign, padding, separator or encoded character. */
const subjectNumber = (segment: string): number | undefined => {
  if (!/^[1-9][0-9]{0,9}$/.test(segment)) return undefined
  const value = Number(segment)
  return value <= REPOSITORY_SUBJECT_NUMBER_MAX ? value : undefined
}

/**
 * The subject the segments BELOW `/owner/repo` name, or undefined when they
 * name none: an unknown head, a malformed number, a tab this app has no view
 * for, or any extra segment. Undefined is the honest answer, and both hosts
 * leave such a path exactly as it was.
 * @since 1.0.0
 * @category parsers
 */
export const parseRepositorySubject = (segments: ReadonlyArray<string>): RepositorySubject | undefined => {
  const [head, second, third, ...rest] = segments
  if (rest.length > 0) return undefined
  if (head === "pulls") return second === undefined ? { kind: "pulls" } : undefined
  if (head === "issues") {
    if (second === undefined) return { kind: "issues" }
    if (third !== undefined) return undefined
    const number = subjectNumber(second)
    return number === undefined ? undefined : { kind: "issue", number }
  }
  if (head !== "pull" || second === undefined) return undefined
  const number = subjectNumber(second)
  if (number === undefined) return undefined
  if (third === undefined) return { kind: "pull", number, tab: "conversation" }
  const tab = third === "conversation" || third === "commits" || third === "checks" || third === "files"
    ? third
    : undefined
  return tab === undefined ? undefined : { kind: "pull", number, tab }
}

/**
 * The owner, repository and subject a pathname names, or undefined when the
 * path is not a repository path at all.
 *
 * The owner and repository are returned in the path's own spelling and are NOT
 * validated here: GitHub's slug rule and the site's reserved first segments
 * are the edge's, and the app has its own repository-name rule. A trailing
 * slash is the same path; a doubled one is not a path this names.
 * @since 1.0.0
 * @category parsers
 */
export const splitRepositoryPath = (
  pathname: string
): { readonly owner: string; readonly name: string; readonly subject?: RepositorySubject } | undefined => {
  if (!pathname.startsWith("/")) return undefined
  const [owner, name, ...rest] = pathname.replace(/\/$/, "").slice(1).split("/")
  if (owner === undefined || owner === "" || name === undefined || name === "") return undefined
  if (rest.length === 0) return { owner, name }
  const subject = parseRepositorySubject(rest)
  return subject === undefined ? undefined : { owner, name, subject }
}
