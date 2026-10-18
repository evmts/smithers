/**
 * Repository contents wire data, shared by readers and capture validation.
 * @since 0.1.0
 */
import { z } from "zod"

/**
 * A repository file response before it becomes a bounded File card.
 * @category schemas
 * @since 0.1.0
 */
export const RepoContentsSchema = z.object({
  path: z.string(),
  type: z.literal("file").optional(),
  content: z.string(),
  encoding: z.enum(["utf-8", "utf8", "base64"]),
  size: z.number().int().nonnegative().optional(),
  sha: z.string().optional(),
  name: z.string().optional()
})
