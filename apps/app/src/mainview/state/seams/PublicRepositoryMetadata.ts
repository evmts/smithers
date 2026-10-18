import { Data } from "effect"
/** Anonymous GitHub metadata reads through the repository permission boundary.
 * @since 0.1.0
 */
import { PublicRepositoryRecordSchema, PublicRepositoryRecordsSchema } from "@smthrs/rpc/PublicRepositoryMetadata"
import type { SeamContext } from "./SeamContext"

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
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^(issues|pulls)(\/[1-9][0-9]*)?$/.test(resource)) throw new RepositoryMetadataReadFailed({ message: "Invalid repository metadata path" })
  const suffix = query?.toString()
  const response = await ctx.http(`${ctx.baseUrl}/api/repos/${repo.split("/").map(encodeURIComponent).join("/")}/github/metadata/${resource}${suffix ? `?${suffix}` : ""}`)
  if (!response.ok) throw new RepositoryMetadataReadFailed({ message: `Repository metadata read failed (${response.status})`, status: response.status })
  const body: unknown = await response.json()
  return /^(issues|pulls)\/[0-9]+$/.test(resource)
    ? PublicRepositoryRecordSchema.parse(body)
    : PublicRepositoryRecordsSchema.parse(body)
}

/** Retry a signed-out GitHub read through the repository's public mirror.
 * @since 0.1.0
 * @category constructors
 */
export const fetchRepositoryMetadata = async (
 ctx: Pick<SeamContext, "http" | "baseUrl">,
 url: string,
): Promise<Response> => {
 const response = await ctx.http(url)
 if (response.status !== 401) return response
 const prefix = `${ctx.baseUrl}/api/user/github-repos/`
 if (!url.startsWith(prefix)) return response
 const match = /^([^/]+)\/([^/]+)\/((?:issues|pulls)(?:\/[1-9][0-9]*(?:\/comments)?)?)(\?.*)?$/.exec(url.slice(prefix.length))
 if (!match) return response
 // A mirror that cannot answer leaves the original refusal in place.
 const mirror = await ctx.http(`${ctx.baseUrl}/api/repos/${match[1]}/${match[2]}/github/metadata/${match[3]}${match[4] ?? ""}`).catch(() => undefined)
 return mirror?.ok === true ? mirror : response
}
