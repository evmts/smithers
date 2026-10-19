/**
 * Input anchoring shared by CLI planning and declaration projections.
 * @since 1.0.0
 */
import * as Input from "@smthrs/targets/Input";
/**
 * Filegroup's explicit cwd is a workspace-relative input anchor, not ownership.
 * @private
 * @since 1.0.0
 */
export const inputPackage = (metadata, declaringPackage) => {
    if (metadata.target !== "Filegroup")
        return declaringPackage;
    const cwd = metadata.attrs.cwd;
    if (cwd === ".")
        return declaringPackage;
    const resolved = Input.resolvePath("", cwd);
    return resolved === "." ? "" : resolved;
};
