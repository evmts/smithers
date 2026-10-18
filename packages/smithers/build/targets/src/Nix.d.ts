/**
 * Nix environment declarations and tool references.
 *
 * A workspace declares the Nix closure its tools come from once, the way it
 * declares a runtime version or an installed `node_modules` tree, and every
 * tool-running target resolves executables from that closure. The
 * declaration is inert data: constructing it performs no I/O, so PACKAGE.ts
 * and WORKSPACE.ts evaluation stay pure. Resolving it to a store path, its
 * `PATH`, and its transitive closure is the planner's job, in
 * `@smthrs/build-cli`.
 *
 * Two forms exist. A flake form names `flake.nix` and its lock and, when the
 * shell is not the default, the dev shell attribute. A file form names a
 * plain Nix expression, such as `.smithers/environment.nix`, that evaluates
 * to one derivation. Both carry their files as declared inputs, so an edit to
 * the flake, its lock, or the expression re-keys every target that runs
 * under the environment.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import * as Input from "./Input.ts";
import * as Reference from "./Reference.ts";
import * as Toolchain from "./Toolchain.ts";
/**
 * A dev shell whose flake and lock are the version authority for one or more
 * `S.Nix.bin` references.
 *
 * `DevShell` predates {@link Environment} and stays as the narrow form a
 * `toolchains` list carries when a workspace pins only a few tools. A
 * workspace that wants every tool from the closure declares an
 * {@link Environment} instead.
 *
 * @category declarations
 * @since 0.1.0
 */
export interface DevShellDeclaration extends Toolchain.Declaration<"NixDevShell"> {
    readonly flake: Input.File;
    readonly lock: Input.File;
}
/**
 * Declares a Nix dev shell as a version authority for `S.Nix.bin` references.
 *
 * @category declarations
 * @since 0.1.0
 */
export declare const DevShell: (options: {
    readonly flake: Input.File;
    readonly lock: Input.File;
}) => DevShellDeclaration;
/**
 * Maximum length of a declared dev shell attribute.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumAttrLength = 256;
/**
 * A dev shell attribute: a bare shell name such as `ci`, or a full flake
 * output path such as `devShells.x86_64-linux.ci`.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const attrShape: RegExp;
/**
 * Schema for the workspace Nix environment declaration.
 *
 * Exactly one of `flake` and `file` is set. `lock` and `attr` accompany a
 * flake only.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const EnvironmentDeclaration: Schema.TaggedStruct<"NixEnvironment", {
    readonly flake: Schema.optional<Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>>;
    readonly lock: Schema.optional<Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>>;
    readonly file: Schema.optional<Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>>;
    readonly attr: Schema.optional<Schema.NonEmptyString>;
}>;
/**
 * The workspace Nix environment declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type Environment = typeof EnvironmentDeclaration.Type;
/**
 * Checks whether a value is a Nix environment declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isEnvironment: (value: unknown) => value is Environment;
/**
 * Options accepted by {@link Environment}: the flake form or the file form.
 *
 * @category models
 * @since 0.1.0
 */
export type EnvironmentOptions = {
    /** The flake that defines the dev shell. */
    readonly flake: Input.File;
    /** @default the `flake.lock` beside the flake */
    readonly lock?: Input.File | undefined;
    /**
     * The dev shell to enter: a bare name resolves to `devShells.<system>.<name>`
     * for the host system, a dotted path is used as written.
     *
     * @default the default dev shell for the host system
     */
    readonly attr?: string | undefined;
    readonly file?: never;
} | {
    /** A Nix expression that evaluates to one derivation. */
    readonly file: Input.File;
    readonly flake?: never;
    readonly lock?: never;
    readonly attr?: never;
};
/**
 * The declared inputs an environment contributes to key material: the flake
 * and its lock, or the expression file.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const environmentInputs: (environment: Environment) => ReadonlyArray<Input.File>;
/**
 * The workspace-relative directory a flake-form environment's flake lives in,
 * `""` for the workspace root.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const flakeDirectory: (environment: Environment) => string;
/**
 * The flake output attribute a flake-form environment's `attr` names for one
 * host system, or undefined when the environment names no attribute and the
 * default dev shell applies.
 *
 * A bare name becomes `devShells.<system>.<name>`; a dotted path is used as
 * written.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const outputAttribute: (environment: Environment, system: string) => string | undefined;
/**
 * The installable argument `nix develop` takes for an environment, relative
 * to the workspace root, for a generated CI script.
 *
 * A flake form renders as `./<dir>` or `./<dir>#<attr>`; `nix develop`
 * resolves a bare attr against `devShells.<system>` itself. A file form
 * renders as `--file <path>`.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const developArguments: (environment: Environment) => ReadonlyArray<string>;
/**
 * `S.Nix.Environment(options)`: the workspace Nix environment.
 *
 * @example
 * ```ts
 * import { Smithers } from "@smthrs/targets"
 *
 * export const environment = Smithers.Nix.Environment({
 *   flake: Smithers.file("//flake.nix")
 * })
 * ```
 *
 * @category declarations
 * @since 0.1.0
 */
export declare const Environment: (options: EnvironmentOptions) => Environment;
/**
 * A binary supplied by the workspace Nix environment or dev shell.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const bin: typeof Reference.nixBin;
