import { Data } from "effect"
/** Anonymous GitHub metadata reads through the repository permission boundary.
 * @since 0.1.0
 */
import { PublicRepositoryRecordSchema, PublicRepositoryRecordsSchema } from "@smthrs/rpc/PublicRepositoryMetadata"
import type { SeamContext } from "./SeamContext"

/** `owner/name` with two plain segments: a `.` or `..` segment would resolve to another route once the path is normalized. */
const repositoryPath = (repo: string): string | undefined => {
  const segments = repo.split("/")
  return segments.length === 2 && segments.every((segment) => /^[\w.-]+$/.test(segment) && segment !== "." && segment !== "..")
    ? segments.map(encodeURIComponent).join("/")
    : undefined
}

/** A rejected repository read retains its diagnostic and HTTP status. */
export class RepositoryMetadataReadFailed extends Data.TaggedError("RepositoryMetadataReadFailed")<{ readonly message: string; readonly status?: number }> {}

/** Read a public issue/pull list or detail without using a personal GitHub credential.
 * @since 0.1.0
 * @category constructors
 */
export const readPublicRepositoryMetadata = async (
  ctx: Pick<SeamContext, "http" | "baseUrl">,
  repo: string,
  resource: string,
  query?: URLSearchParams,
) => {
  const path = repositoryPath(repo)
  if (path === undefined || !/^(issues|pulls)(\/[1-9][0-9]*)?$/.test(resource)) throw new RepositoryMetadataReadFailed({ message: "Invalid repository metadata path" })
  const suffix = query?.toString()
  const response = await ctx.http(`${ctx.baseUrl}/api/repos/${path}/github/metadata/${resource}${suffix ? `?${suffix}` : ""}`)
  if (!response.ok) throw new RepositoryMetadataReadFailed({ message: `Repository metadata read failed (${response.status})`, status: response.status })
  const body: unknown = await response.json()
  return /^(issues|pulls)\/[0-9]+$/.test(resource)
    ? PublicRepositoryRecordSchema.parse(body)
    : PublicRepositoryRecordsSchema.parse(body)
}

/** Retry a signed-out GitHub read through the repository's public mirror.
 *
 * The proxy URL names the GitHub source (`/api/user/github-repos/<source>/...`);
 * the mirror lives under the Smithers repository (`/api/repos/<repo>/github/metadata/...`),
 * and the two differ when a repository mirrors another name (smithers-canary/smithers
 * mirrors smithersai/smithers). Pass that Smithers `repo` so a 401 is retried at its
 * mirror; without it (or with one that is not two plain segments) the mirror is read
 * under the proxy URL's own name, as before.
 * @since 0.1.0
 * @category constructors
 */
export const fetchRepositoryMetadata = async (
 ctx: Pick<SeamContext, "http" | "baseUrl">,
 url: string,
 repo?: string,
): Promise<Response> => {
 const response = await ctx.http(url)
 if (response.status !== 401) return response
 const prefix = `${ctx.baseUrl}/api/user/github-repos/`
 if (!url.startsWith(prefix)) return response
 const match = /^([^/]+)\/([^/]+)\/((?:issues|pulls)(?:\/[1-9][0-9]*(?:\/comments)?)?)(\?.*)?$/.exec(url.slice(prefix.length))
 if (!match) return response
 // A mirror that cannot answer leaves the original refusal in place.
 const mirrorRepo = (repo === undefined ? undefined : repositoryPath(repo)) ?? `${match[1]}/${match[2]}`
 const mirror = await ctx.http(`${ctx.baseUrl}/api/repos/${mirrorRepo}/github/metadata/${match[3]}${match[4] ?? ""}`).catch(() => undefined)
 return mirror?.ok === true ? mirror : response
}
