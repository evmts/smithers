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
    status: z.enum(["added", "modified", "deleted"]),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative()
  }))
})
