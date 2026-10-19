/**
 * Input anchoring shared by CLI planning and declaration projections.
 * @since 1.0.0
 */
import type * as Target from "@smthrs/targets/Target";
/**
 * Filegroup's explicit cwd is a workspace-relative input anchor, not ownership.
 * @private
 * @since 1.0.0
 */
export declare const inputPackage: (metadata: Target.Metadata, declaringPackage: string) => string;
