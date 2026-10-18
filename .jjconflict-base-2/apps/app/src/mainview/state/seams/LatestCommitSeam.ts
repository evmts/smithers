/*
 * The commits read (Platform's P-1 contract, platform-lead f-tda4y7):
 *
 *   GET /api/repos/{owner}/{repo}/commits?ref=<bookmark|tag|sha>&limit=1
 *     -> 200 { items: [ { sha, short_sha, title, body, author, authored_at, committed_at, parents } ], next_cursor? }
 *
 * newest first; public repositories readable signed out, like contents; 400
 * for a bad limit or ref, 404 for an unknown repository or commit; a private
 * repository refuses non-readers. The Code home's latest-commit row reads
 * `items[0]` at the ref it shows (the default bookmark when absent). The
 * route lands with Platform's P-1; until it is on this host the read answers
 * with its refusal and the caller falls back to the head's change record.
 */
import type { SeamContext } from "./SeamContext"
import { readErrorMessage } from "./SeamContext"

/** One commit as the Code home shows it: message, author and age, with the id behind them. */
export interface LatestCommit {
  readonly sha: string
  readonly shortSha: string
  /** The first line of the message. */
  readonly title: string
  /** The author's display name; null when the record carries none. */
  readonly author: string | null
  /** RFC 3339; null when the record carries no time. */
  readonly committedAt: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null)

/** `items[0]` of the commits answer; null when the answer carries no usable commit. */
export const parseLatestCommit = (body: unknown): LatestCommit | null => {
  if (!isRecord(body) || !Array.isArray(body.items)) return null
  const first = body.items[0]
  if (!isRecord(first)) return null
  const sha = str(first.sha)
  if (sha === null || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(sha)) return null
  const time = str(first.committed_at) ?? str(first.authored_at)
  return {
    sha,
    shortSha: str(first.short_sha) ?? sha.slice(0, 7),
    title: (str(first.title) ?? "").split("\n")[0] ?? "",
    author: str(first.author),
    committedAt: time !== null && !Number.isNaN(Date.parse(time)) ? time : null
  }
}

/** The newest commit at `ref` (the repository's default when absent), or the read's own refusal. */
export const readLatestCommit = async (
  ctx: Pick<SeamContext, "http" | "baseUrl">,
  repo: string,
  ref?: string
): Promise<LatestCommit | { readonly error: string }> => {
  const [owner = "", name = ""] = repo.split("/")
  const query = new URLSearchParams({ limit: "1" })
  if (ref !== undefined && ref !== "") query.set("ref", ref)
  let response: Response
  try {
    response = await ctx.http(`${ctx.baseUrl}/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits?${query.toString()}`)
  } catch {
    return { error: `Commits for ${repo} couldn't be read — the platform didn't answer.` }
  }
  if (!response.ok) return { error: await readErrorMessage(response, `Commits for ${repo} couldn't be read (${response.status}).`) }
  const commit = parseLatestCommit(await response.json().catch(() => undefined))
  return commit ?? { error: `Commits for ${repo} answered with a payload this app couldn't read.` }
}
