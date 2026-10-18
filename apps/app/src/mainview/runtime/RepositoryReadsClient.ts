/**
 * Repository reads use the application's existing authentication, transport and typed errors.
 * @since 0.1.0
 */
import { RepositoryBranchPageSchema, RepositoryCodeSearchSchema, RepositoryIssueSearchSchema, RepositoryCommitDetailSchema, RepositoryCommitPageSchema } from "@smthrs/rpc/RepositoryReads"
import type { ApplicationClient } from "./ApplicationClient.ts"

const repositoryPath = (owner: string, repo: string): string =>
  `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

/** Read one history page, optionally restricted to a path.
 * @category services
 * @since 0.1.0
 */
export const listRepositoryCommits = async (
  client: ApplicationClient,
  owner: string,
  repo: string,
  options: { readonly ref?: string; readonly path?: string; readonly cursor?: string; readonly limit?: number; readonly signal?: AbortSignal } = {}
) => {
  const query = new URLSearchParams()
  if (options.ref !== undefined) query.set("ref", options.ref)
  if (options.path !== undefined) query.set("path", options.path)
  if (options.cursor !== undefined) query.set("cursor", options.cursor)
  if (options.limit !== undefined) query.set("limit", String(options.limit))
  return RepositoryCommitPageSchema.parse(await client.request(`${repositoryPath(owner, repo)}/commits?${query}`, { signal: options.signal }))
}

/** Read an immutable commit with its first-parent changed-file summary.
 * @category services
 * @since 0.1.0
 */
export const getRepositoryCommit = async (
  client: ApplicationClient, owner: string, repo: string, sha: string, signal?: AbortSignal
) => RepositoryCommitDetailSchema.parse(await client.request(`${repositoryPath(owner, repo)}/commits/${encodeURIComponent(sha)}`, { signal }))


type SearchOptions = { readonly cursor?: string; readonly limit?: number; readonly signal?: AbortSignal }
const repositorySearch = async (client: ApplicationClient, owner: string, repo: string, kind: "code" | "issues", q: string, options: SearchOptions) => {
  const query = new URLSearchParams({ q })
  if (options.cursor !== undefined) query.set("cursor", options.cursor)
  if (options.limit !== undefined) query.set("limit", String(options.limit))
  return client.request(`${repositoryPath(owner, repo)}/search/${kind}?${query}`, { signal: options.signal })
}
/** Search code in one repository through the existing indexed search service.
 * @category services
 * @since 0.1.0
 */
export const searchRepositoryCode = async (client: ApplicationClient, owner: string, repo: string, q: string, options: SearchOptions = {}) =>
  RepositoryCodeSearchSchema.parse(await repositorySearch(client, owner, repo, "code", q, options))
/** Search issues in one repository through the existing indexed search service.
 * @category services
 * @since 0.1.0
 */
export const searchRepositoryIssues = async (client: ApplicationClient, owner: string, repo: string, q: string, options: SearchOptions = {}) =>
  RepositoryIssueSearchSchema.parse(await repositorySearch(client, owner, repo, "issues", q, options))

/** List branches using the backend's existing bookmark pagination and immutable head metadata.
 * @category services
 * @since 0.1.0
 */
export const listRepositoryBranches = async (client: ApplicationClient, owner: string, repo: string, options: SearchOptions = {}) => {
  const query = new URLSearchParams()
  if (options.cursor !== undefined) query.set("cursor", options.cursor)
  if (options.limit !== undefined) query.set("limit", String(options.limit))
  return RepositoryBranchPageSchema.parse(await client.request(`${repositoryPath(owner, repo)}/branches?${query}`, { signal: options.signal }))
}
