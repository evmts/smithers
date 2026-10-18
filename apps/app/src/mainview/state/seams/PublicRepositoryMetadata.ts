/** Anonymous GitHub metadata reads through the repository permission boundary.
 * @since 0.1.0
 */
import { PublicRepositoryRecordSchema, PublicRepositoryRecordsSchema } from "@smthrs/rpc/PublicRepositoryMetadata"
import type { SeamContext } from "./SeamContext"

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
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^(issues|pulls)(\/[1-9][0-9]*)?$/.test(resource)) throw new Error("Invalid repository metadata path")
  const suffix = query?.toString()
  const response = await ctx.http(`${ctx.baseUrl}/api/repos/${repo.split("/").map(encodeURIComponent).join("/")}/github/metadata/${resource}${suffix ? `?${suffix}` : ""}`)
  if (!response.ok) throw new Error(`Repository metadata read failed (${response.status})`)
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
 return ctx.http(`${ctx.baseUrl}/api/repos/${match[1]}/${match[2]}/github/metadata/${match[3]}${match[4] ?? ""}`)
}
