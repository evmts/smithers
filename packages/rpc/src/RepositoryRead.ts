/** Public mirror reads consumed by the repository browser.
 * @since 1.0.0
 */
import { z } from "zod"

/** A refusal from a mirror or identity read.
 * @category schemas
 * @since 1.0.0
 */
export const RepositoryReadErrorSchema = z.object({ message: z.string() })
/** Metadata for a repository's shared copy.
 * @category schemas
 * @since 1.0.0
 */
export const RepositoryMetadataSchema = z.object({
  is_public: z.boolean(), owner: z.string(), name: z.string(), full_name: z.string(),
  default_bookmark: z.string(), owner_type: z.enum(["User", "Organization"])
})
/** Anonymous repository discovery.
 * @category schemas
 * @since 1.0.0
 */
export const PublicRepositoriesSchema = z.object({ repos: z.array(z.object({ name: z.string() })) })
/** The contents endpoint returns a directory or the complete UTF-8 file.
 * @category schemas
 * @since 1.0.0
 */
export const RepositoryContentsSchema = z.union([
  z.array(z.object({ name: z.string(), path: z.string(), type: z.enum(["file", "dir"]), size: z.number().nonnegative() })),
  z.object({ type: z.literal("file"), path: z.string(), content: z.string(), encoding: z.literal("utf-8") })
])
/** Shared-copy bookmarks, with pagination.
 * @category schemas
 * @since 1.0.0
 */
export const RepositoryBookmarksSchema = z.object({ items: z.array(z.object({
  name: z.string(), target_change_id: z.string(), target_commit_id: z.string(), is_tracking_remote: z.boolean()
})), next_cursor: z.string() })
/** Repository tracker issue rows (distinct from GitHub's source tracker).
 * @category schemas
 * @since 1.0.0
 */
export const RepositoryIssuesSchema = z.array(z.object({
  number: z.number().int().positive(), title: z.string(), state: z.enum(["open", "closed"]),
  author: z.object({ login: z.string() }), labels: z.array(z.string()), comment_count: z.number().int().nonnegative(), updated_at: z.string()
}))
/** GitHub-source issues alongside the repository tracker.
 * @category schemas
 * @since 1.0.0
 */
export const RepositoryGithubIssuesSchema = z.array(z.object({
  number: z.number().int().positive(), title: z.string(), state: z.enum(["open", "closed"])
}))
/** Saved issue views; an empty list means no custom views were declared.
 * @category schemas
 * @since 1.0.0
 */
export const RepositoryIssueViewsSchema = z.array(z.object({ id: z.string(), title: z.string() }))

/** Guest compute is disabled in the read-only spec world.
 * @category schemas
 * @since 1.0.0
 */
export const RepositoryGuestSchema = z.object({ allowed: z.literal(false) })

/** Organization inventory used to classify repository owners.
 * @category schemas
 * @since 1.0.0
 */
export const RepositoryOrganizationsSchema = z.array(z.object({ name: z.string() }))
/** Workspace inventory for a member's repository switcher.
 * @category schemas
 * @since 1.0.0
 */
export const RepositoryWorkspacesSchema = z.array(z.object({
  workspace_id: z.string(), repository_id: z.number(), repository_owner: z.string(), repository_name: z.string(),
  workspace_title: z.string(), state: z.string(), last_accessed_at: z.string().nullable(), last_activity_at: z.string(), created_at: z.string(), sort_timestamp: z.string()
}))
/** Initial member view preferences; absent optional preferences keep application defaults.
 * @category schemas
 * @since 1.0.0
 */
export const RepositoryViewPreferencesSchema = z.object({ last_seen_seq: z.number().int().nonnegative().optional() })
