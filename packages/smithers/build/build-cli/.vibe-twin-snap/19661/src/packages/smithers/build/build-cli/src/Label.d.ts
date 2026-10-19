/**
 * Bazel-style target labels and patterns.
 *
 * @since 0.1.0
 */
/**
 * A parsed exact label or recursive package pattern.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type Pattern = {
    readonly _tag: "Exact";
    readonly packagePath: string;
    readonly target: string | undefined;
} | {
    readonly _tag: "Subtree";
    readonly packagePath: string;
    /**
     * The one target name the subtree selects, `//packages/...:bunTest`, or
     * undefined for every target under the subtree.
     *
     * This is the Bazel-natural spelling of a matrix that one package at a
     * time opts into: the packages declare the target under a shared key and
     * the pattern names that key, instead of a central declaration file
     * listing which packages are in.
     */
    readonly target: string | undefined;
};
/**
 * Parses the supported Bazel label grammar: `:name`, `//pkg`, `//pkg:name`,
 * `//pkg/...`, and `//pkg/...:name`.
 *
 * @category parsing
 * @since 0.1.0
 * @slop
 */
export declare const parse: (value: string, currentPackage: string) => Pattern;
/**
 * Formats a path-derived target label.
 *
 * @category formatting
 * @since 0.1.0
 * @slop
 */
export declare const format: (packagePath: string, target: string) => string;
/**
 * Computes the current package path, or undefined for a directory outside
 * the workspace.
 *
 * Absolute `//...` labels and patterns never need a current package, so an
 * outside directory is not an error here; only resolving a `:name`-relative
 * label requires one, and the caller reports that case.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const currentPackageOrUndefined: (workspaceRoot: string, cwd: string) => string | undefined;
/**
 * Computes the current package path and refuses directories outside the
 * workspace.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const currentPackage: (workspaceRoot: string, cwd: string) => string;
