/**
 * Tagged diagnostics for PACKAGE.ts / WORKSPACE.ts routing.
 *
 * Every failure in discovery, loading, and indexing carries one stable code
 * from the routing plan's diagnostic model, the workspace-relative path it
 * concerns when one exists, and — for cycles — the full import chain.
 * Human text renders at the CLI boundary; the code is the contract.
 *
 * @since 0.1.0
 */
/**
 * The stable diagnostic codes.
 *
 * The base set is the routing plan's section-10 minimum; `unknown_agent`,
 * `unknown_flag`, and `private_owner_conflict` extend it for index-time
 * reference resolution and private-target owner binding.
 *
 * @category models
 * @since 0.1.0
 */
export type Code = "workspace_root_invalid" | "local_repository_invalid" | "nested_workspace_undeclared" | "inventory_failed" | "invalid_inventory_path" | "inventory_limit_exceeded" | "module_missing" | "module_not_regular" | "module_outside_workspace" | "module_link_collision" | "module_too_large" | "package_syntax_unsupported" | "workspace_syntax_unsupported" | "module_compile_failed" | "module_import_failed" | "declaration_dependency_unresolved" | "declaration_dependency_mismatch" | "package_import_cycle" | "runtime_import_cycle" | "unsupported_module_specifier" | "package_static_runtime_mismatch" | "workspace_export_missing" | "workspace_export_duplicate" | "factory_export_missing" | "factory_export_duplicate" | "factory_imports_package" | "package_export_missing" | "invalid_package_export" | "naked_target_export" | "invalid_package_options" | "invalid_target_key" | "invalid_target_value" | "invalid_workspace_options" | "package_mutated_after_declare" | "duplicate_package_path" | "case_collision" | "duplicate_label" | "target_multiple_labels" | "unknown_label" | "no_default_target" | "unknown_agent" | "unknown_flag" | "unknown_team" | "undeclared_host_bin" | "illegal_data_target" | "private_owner_conflict" | "manifest_encode_failed" | "manifest_drift" | "manifest_write_failed" | "watch_refresh_failed";
/**
 * Extra facts one diagnostic may carry.
 *
 * @category models
 * @since 0.1.0
 */
export interface Details {
    readonly path?: string | undefined;
    readonly label?: string | undefined;
    readonly chain?: ReadonlyArray<string> | undefined;
    readonly cause?: unknown;
}
declare const PackageError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/PackageError";
} & Readonly<A>;
/**
 * One routing diagnostic.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class PackageError extends PackageError_base<{
    readonly code: Code;
    readonly path: string | undefined;
    readonly label: string | undefined;
    readonly chain: ReadonlyArray<string> | undefined;
    readonly message: string;
    readonly cause?: unknown;
}> {
    constructor(code: Code, message: string, details?: Details);
}
/**
 * Checks whether a value is a routing diagnostic.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isPackageError: (value: unknown) => value is PackageError;
/**
 * One declared input the target index found absent: the workspace-relative
 * path (a file, or a glob pattern that matched no file), the label of the
 * target that declares it, and the workspace-relative `PACKAGE.ts` that
 * declared the target.
 *
 * @category models
 * @since 1.0.0
 */
export interface MissingInput {
    readonly path: string;
    readonly label: string;
    readonly sourceFile: string | undefined;
}
declare const DeclaredInputMissing_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/DeclaredInputMissing";
} & Readonly<A>;
/**
 * The `//:targetIndex` refusal for declared inputs that do not exist: a
 * `Smithers.file()` that names no file, a glob (with its brace alternatives,
 * exclusions and ignore rules applied) that matches no file, or a workflow an
 * `Actionlint` requirement names that is not on disk. Every absent input is
 * listed, so one run names every repair.
 *
 * @category errors
 * @since 1.0.0
 */
export declare class DeclaredInputMissing extends DeclaredInputMissing_base<{
    readonly missing: ReadonlyArray<MissingInput>;
    readonly message: string;
}> {
    constructor(missing: ReadonlyArray<MissingInput>);
}
/**
 * A declared glob whose files belong to other packages.
 * @category models
 * @since 1.0.0
 */
export interface CrossingInput extends MissingInput {
    readonly packages: ReadonlyArray<string>;
}
declare const DeclaredInputCrossesPackage_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/DeclaredInputCrossesPackage";
} & Readonly<A>;
/**
 * Refuses unreviewed globs that contribute no package-scoped cache material.
 * @category errors
 * @since 1.0.0
 */
export declare class DeclaredInputCrossesPackage extends DeclaredInputCrossesPackage_base<{
    readonly crossing: ReadonlyArray<CrossingInput>;
    readonly message: string;
}> {
    constructor(crossing: ReadonlyArray<CrossingInput>);
}
declare const CrossPackageGlobReviewInvalid_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/CrossPackageGlobReviewInvalid";
} & Readonly<A>;
/**
 * Refuses unreadable reviewed lists and entries whose crossing was repaired.
 * @category errors
 * @since 1.0.0
 */
export declare class CrossPackageGlobReviewInvalid extends CrossPackageGlobReviewInvalid_base<{
    readonly reason: "unreadable" | "stale";
    readonly entries: ReadonlyArray<{
        readonly label: string;
        readonly path: string;
    }>;
    readonly cause?: unknown;
    readonly message: string;
}> {
}
export {};
