/**
 * Immutable repository history shared by HTTP readers and the default repository UI.
 * @since 0.1.0
 */
import { z } from "zod"

const sha = z.string().regex(/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/)
/** A Git commit's recorded identity, message and parents. Unknown GitHub profiles stay absent.
 * @category schemas
 * @since 0.1.0
 */
export const RepositoryCommitSchema = z.object({
  sha,
  short_sha: z.string().min(4).max(64),
  title: z.string(),
  body: z.string(),
  author: z.string(),
  author_login: z.string().optional(),
  author_avatar: z.url().optional(),
  authored_at: z.iso.datetime({ offset: true }),
  committed_at: z.iso.datetime({ offset: true }),
  parents: z.array(sha)
})
/** One bounded history page with an opaque continuation pinned to its first commit.
 * @category schemas
 * @since 0.1.0
 */
export const RepositoryCommitPageSchema = z.object({
  items: z.array(RepositoryCommitSchema),
  next_cursor: z.string().min(1).optional()
})
/** A commit and its changes against the first parent, or the empty tree for a root.
 * @category schemas
 * @since 0.1.0
 */
export const RepositoryCommitDetailSchema = RepositoryCommitSchema.extend({
  files: z.array(z.object({
    path: z.string().min(1),
    from: z.string().min(1).optional(),
    status: z.enum(["added", "modified", "deleted", "renamed"]),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative()
  }))
})

const searchPage = {
  total_count: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  per_page: z.number().int().positive()
}
const searchRepository = {
  repository_id: z.number().int().positive(),
  repository_owner: z.string(),
  repository_name: z.string()
}
/** Code index matches within one authorized repository; snippets remain escaped text.
 * @category schemas
 * @since 0.1.0
 */
export const RepositoryCodeSearchSchema = z.object({
  ...searchPage,
  items: z.array(z.object({ ...searchRepository, path: z.string(), snippet: z.string() }))
})
/** Issue matches within one authorized repository, including its pagination count.
 * @category schemas
 * @since 0.1.0
 */
export const RepositoryIssueSearchSchema = z.object({
  ...searchPage,
  items: z.array(
    z.object({
      ...searchRepository,
      id: z.number().int().positive(),
      number: z.number().int().positive(),
      title: z.string(),
      state: z.enum(["open", "closed"])
    })
  )
})

