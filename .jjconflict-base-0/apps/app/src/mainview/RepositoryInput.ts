/** The shared repository input grammar, isolated from app boot. */
const REPO_NAME = /^[\w.-]+\/[\w.-]+$/

/**
 * The hosts a pasted repository URL may name: GitHub's, because a GitHub URL
 * is the one a reader already has. Any other host is refused rather than
 * followed — the launcher's Open box navigates, and a box that navigates
 * anywhere a string says is a redirector.
 */
export const REPOSITORY_URL_HOSTS: ReadonlyArray<string> = ["github.com", "www.github.com"]

/** Why a typed repository could not be read as one. The input is never quoted back. */
export const REPOSITORY_INPUT_EMPTY = "Enter a repository as owner/name."
export const REPOSITORY_INPUT_INVALID =
  "That isn't a repository. Enter owner/name, or paste its github.com URL."

/** The two segments below a URL's or a path's first slash, with a trailing `.git` dropped. */
const repoFromSegments = (segments: ReadonlyArray<string>): string | undefined => {
  const [owner, name] = segments.filter(segment => segment !== "")
  if (owner === undefined || name === undefined) return undefined
  const repo = `${owner}/${name.replace(/\.git$/, "")}`
  return REPO_NAME.test(repo) && !repo.split("/").some(part => part === "." || part === "..") ? repo : undefined
}

/**
 * The repository a person typed into the launcher's Open box, by the SAME
 * rule a repository path is read with (`pathTarget`): one `owner/name`, in
 * its own spelling, and nothing else.
 *
 * Three spellings are accepted because all three are what a reader has: the
 * bare `owner/name`, a github.com repository URL (with or without its
 * scheme, its `.git`, a deeper `tree`/`blob` path, a query or a fragment),
 * and a path of this app's own (`/owner/name`). A URL carrying credentials,
 * a scheme that is not http(s), or any other host is refused: the box
 * navigates, so a host it does not know is somebody else's site.
 *
 * The refusal is one of the two sentences above and never repeats what was
 * typed, so a pasted token is not reflected back onto the page.
 */
export const repositoryInputTarget = (text: string): { readonly repo: string } | { readonly error: string } => {
  const value = text.trim()
  if (value === "") return { error: REPOSITORY_INPUT_EMPTY }
  const invalid = { error: REPOSITORY_INPUT_INVALID }
  const scheme = /^[a-z][a-z\d+.-]*:/i.test(value)
  const hostly = /^(?:www\.)?github\.com\//i.test(value)
  if (scheme || hostly || value.startsWith("//")) {
    let url: URL
    try {
      url = new URL(scheme ? value : `https://${value.replace(/^\/\//, "")}`)
    } catch {
      return invalid
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return invalid
    if (url.username !== "" || url.password !== "") return invalid
    if (!REPOSITORY_URL_HOSTS.includes(url.hostname.toLowerCase())) return invalid
    const repo = repoFromSegments(url.pathname.split("/"))
    return repo === undefined ? invalid : { repo }
  }
  if (value.startsWith("/")) {
    const repo = repoFromSegments(value.split(/[?#]/)[0]!.split("/"))
    return repo === undefined ? invalid : { repo }
  }
  return REPO_NAME.test(value) && !value.split("/").some(part => part === "." || part === "..")
    ? { repo: value }
    : invalid
}

