/** Shared identity construction for native facts and the legacy control trail.
 * @since 1.0.0
 */
import type * as Cell from "@smthrs/harness/Cell";
/** Exact pre-existing cell-call-v1 contract, without publication coordinates.
 * @category projections
 * @since 1.0.0
 */
export declare const callId: (identity: Cell.CallIdentity) => string;
