/** Public repository issue and pull metadata uses the same GitHub JSON shape.
 * @since 0.1.0
 */

import { z } from "zod"

/** A GitHub issue or pull record, retaining fields consumed by each view.
 * @since 0.1.0
 * @category schemas
 */
export const PublicRepositoryRecordSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.string()
}).passthrough()

/** One complete metadata page; pagination remains in the Link header.
 * @since 0.1.0
 * @category schemas
 */
export const PublicRepositoryRecordsSchema = z.array(PublicRepositoryRecordSchema)
