/**
 * The GitHub-shaped paths a repository URL carries, parsed once for both hosts.
 *
 * Someone who swaps `github.com` for `smithers.sh` keeps the whole path, not
 * only `/owner/repo`: a pull request, one of its tabs, the pull request list,
 * the issue list, one issue, a folder, a file. Two readers decide what such a
 * path means — the
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
 * are exactly the app's four (`prs.tab`).
 *
 * `tree` and `blob` carry their whole remainder as ONE opaque `location`,
 * because a GitHub ref may hold slashes (`release/1.2`) and so may the path
 * below it: which slash divides them is a fact about the repository's refs,
 * not about the URL. Nothing here guesses it. {@link resolveRefLocation}
 * divides the location against a list of refs somebody authoritative read —
 * plus the one spelling that needs no list, a whole commit object name
 * ({@link isCommitRevision}) — and a location neither matches is refused
 * rather than split.
 * @since 1.0.0
 * @category models
 */
export type RepositorySubject =
  | { readonly kind: "pull"; readonly number: number; readonly tab: "conversation" | "commits" | "checks" | "files" }
  | { readonly kind: "pulls" }
  | { readonly kind: "issue"; readonly number: number }
  | { readonly kind: "issues" }
  | { readonly kind: "tree"; readonly location: string }
  | { readonly kind: "blob"; readonly location: string }

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
 * The most segments and the most characters a file location may carry.
 *
 * A repository path is not an unbounded input: GitHub's own ref and path
 * rules are far below these, and a bound means a pathological URL is refused
 * by the grammar instead of walking a ref list segment by segment.
 * @since 1.0.0
 * @category constants
 */
export const REPOSITORY_LOCATION_MAX_SEGMENTS = 64

/**
 * The most characters a file location may carry, counted on the joined
 * location as it was written.
 * @since 1.0.0
 * @category constants
 */
export const REPOSITORY_LOCATION_MAX_LENGTH = 1024

/**
 * The percent escapes a location segment may carry: a well formed `%XX`
 * which is NOT a separator, a control character or another percent.
 *
 * `%2F` and `%5C` are refused because a separator that arrives encoded would
 * become one on the single decode {@link resolveRefLocation} does, widening
 * a two-segment URL into three after both hosts agreed on its shape. `%25`
 * is refused for the same reason one step further out: an encoded percent is
 * the first half of an escape that only exists after a SECOND decode, which
 * nothing here performs and nothing downstream may be relied on to skip.
 */
const safeEscapes = (segment: string): boolean => {
  for (const escape of segment.match(/%.{0,2}/g) ?? []) {
    if (!/^%[0-9a-fA-F]{2}$/.test(escape)) return false
    const code = Number.parseInt(escape.slice(1), 16)
    if (code === 0x2f || code === 0x5c || code === 0x25 || code < 0x20 || code === 0x7f) return false
  }
  return true
}

/**
 * The `tree`/`blob` remainder as one location, or undefined when the
 * segments are not a location at all.
 *
 * The location is returned exactly as it was written — undecoded, in its own
 * case — because the ref and the path inside it are both case-sensitive and
 * neither is this grammar's to normalize. Refused: no segments at all, an
 * empty, `.` or `..` segment (a traversal, before anything joins it to a
 * repository root), a backslash or control character, an escape
 * {@link safeEscapes} rejects, a first segment carrying `:` (a ref may not,
 * and `blob/https://host` is then never a location), and anything past the
 * bounds above.
 * @since 1.0.0
 * @category parsers
 */
export const repositoryLocation = (segments: ReadonlyArray<string>): string | undefined => {
  if (segments.length === 0 || segments.length > REPOSITORY_LOCATION_MAX_SEGMENTS) return undefined
  const location = segments.join("/")
  if (location.length > REPOSITORY_LOCATION_MAX_LENGTH) return undefined
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return undefined
    if (/[\\\u0000-\u001f\u007f]/.test(segment)) return undefined
    if (!safeEscapes(segment)) return undefined
  }
  return segments[0]!.includes(":") ? undefined : location
}

/**
 * The number of hex characters a whole commit object name carries.
 * @since 1.0.0
 * @category constants
 */
export const REPOSITORY_COMMIT_ID_LENGTH = 40

/**
 * True when a location's first segment is a WHOLE commit object name.
 *
 * This is the one revision spelling a reader can paste that names a revision
 * by itself: GitHub's own permalink writes the full object name where a branch
 * would go, no bookmark list can hold it, and nothing shorter is unambiguous —
 * an abbreviation is also a legal branch name, so accepting one would be the
 * guess this grammar exists to refuse. The spelling is kept exactly as the URL
 * wrote it; the revision is resolved by whoever reads the repository
 * (`GET /api/repos/{owner}/{repo}/contents/{path}?ref=<revision>`), not here.
 * @since 1.0.0
 * @category predicates
 */
export const isCommitRevision = (segment: string): boolean => COMMIT_OBJECT_NAME.test(segment)

/** `REPOSITORY_COMMIT_ID_LENGTH` hex characters and nothing else, compiled once. */
const COMMIT_OBJECT_NAME = new RegExp(`^[0-9a-fA-F]{${REPOSITORY_COMMIT_ID_LENGTH}}$`)

/**
 * A location divided into the ref it names and the path below that ref.
 * @since 1.0.0
 * @category models
 */
export interface RefLocation {
  /** The ref, exactly as the authoritative list spells it. */
  readonly ref: string
  /** The path below the ref, decoded once; `""` is the ref's own root. */
  readonly path: string
}

/**
 * Divide a `tree`/`blob` location into its ref and its path, against the
 * refs somebody authoritative listed for that repository.
 *
 * The longest matching ref wins. Git forbids a ref being a directory of
 * another ref, so at most one of `release` and `release/1.2` can exist and
 * the rule is never a tie-break in practice; it is the rule anyway, so an
 * inventory that somehow holds both divides at the one the URL spells out.
 * Matching is case-sensitive and whole-segment: `Main` is not `main`, and
 * `mainline/x` does not match the ref `main`.
 *
 * Each segment is decoded exactly ONCE here — the grammar refused every
 * escape that a decode could turn into a separator or another escape, so one
 * decode cannot widen the location. A malformed escape the grammar let
 * through (a lone `%` is not one) makes the whole location undefined rather
 * than a path with a mangled segment.
 *
 * A first segment that is a whole commit object name ({@link isCommitRevision})
 * is a revision on its own: the permalink a reader pastes out of a review
 * names it unambiguously, and no bookmark list can hold it. It competes as a
 * one-segment candidate under the same longest-match rule, so a READ ref that
 * reaches further still wins and no link falls through to a shorter division
 * that would open a different file.
 *
 * Undefined is the honest answer when neither matches: a URL names a ref this
 * reader cannot confirm — an abbreviated object name, a tag (no read here
 * lists tags) or a branch nobody listed — and dividing it anyway would open
 * some other repository path under some other ref's name.
 * @since 1.0.0
 * @category parsers
 */
export const resolveRefLocation = (
  location: string,
  refs: Iterable<string>
): RefLocation | undefined => {
  const decoded: Array<string> = []
  for (const segment of location.split("/")) {
    let value: string
    try {
      value = decodeURIComponent(segment)
    } catch {
      return undefined
    }
    if (value === "" || value === "." || value === ".." || value.includes("/") || value.includes("\\")) return undefined
    decoded.push(value)
  }
  let best: RefLocation | undefined
  let bestSegments = 0
  if (isCommitRevision(decoded[0]!)) {
    best = { ref: decoded[0]!, path: decoded.slice(1).join("/") }
    bestSegments = 1
  }
  for (const ref of refs) {
    const parts = ref.split("/")
    if (ref === "" || parts.length > decoded.length || parts.length <= bestSegments) continue
    if (parts.some((part, index) => part !== decoded[index])) continue
    best = { ref, path: decoded.slice(parts.length).join("/") }
    bestSegments = parts.length
  }
  return best
}

/**
 * The subject the segments BELOW `/owner/repo` name, or undefined when they
 * name none: an unknown head, a malformed number, a tab this app has no view
 * for, a location {@link repositoryLocation} refuses, or any extra segment.
 * Undefined is the honest answer, and both hosts leave such a path exactly as
 * it was.
 * @since 1.0.0
 * @category parsers
 */
export const parseRepositorySubject = (segments: ReadonlyArray<string>): RepositorySubject | undefined => {
  const [head, ...below] = segments
  if (head === "tree" || head === "blob") {
    const location = repositoryLocation(below)
    return location === undefined ? undefined : { kind: head, location }
  }
  const [second, third, ...rest] = below
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
