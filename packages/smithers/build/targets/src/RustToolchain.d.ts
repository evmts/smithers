/**
 * Declared Rust toolchain for PACKAGE.ts targets.
 *
 * A Rust toolchain declaration names how a workspace obtains `rustc` and
 * `cargo`, and where the pin that fixes their version lives. It is inert data:
 * the constructors validate and perform no I/O, so PACKAGE.ts evaluation stays
 * pure.
 *
 * The declaration exists for the same reason {@link Runtime} does. Before it,
 * the only way to say "CI installs the pinned Rust toolchain and then runs
 * clippy" was a pair of shell strings in a PACKAGE.ts file, which put an argv
 * outside every target implementation and left the toolchain undeclared key
 * material. A declaration makes the pin a content-digested input:
 * {@link CargoCheck} takes it as an attr and asks this module for the argv, and
 * the CI generator derives its bootstrap step from the same value.
 *
 * The declaration is a discriminated union, one variant per way of obtaining a
 * toolchain, discriminated by `name`. Only `pinned` exists today: `rustup`
 * reads `rust-toolchain.toml` and installs exactly what it pins, components and
 * targets included, so the pin cannot drift from what runs. A workspace that
 * needs a channel it does not pin adds a variant here, which is the point — the
 * set of toolchains a PACKAGE.ts file may declare is reviewed, not free text.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import * as Input from "./Input.ts";
/**
 * Schema for the supported ways of obtaining a Rust toolchain.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Name: Schema.Literals<readonly ["pinned"]>;
/**
 * The supported ways of obtaining a Rust toolchain.
 *
 * @category models
 * @since 0.1.0
 */
export type Name = typeof Name.Type;
/**
 * Maximum length of a declared executable or text channel.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumTextLength = 256;
/**
 * Schema for a toolchain obtained from a checked-in `rustup` pin.
 *
 * `pin` is the workspace-relative file `rustup` reads. Its content digest is
 * key material, so changing its channel cannot reuse Cargo results produced by
 * a different compiler.
 *
 * Durable key change: the pin content digest now participates in every
 * `S.Cargo.*` target key. Existing keys intentionally move because their cached
 * compiler identity was incomplete. Operators should expect one full Cargo
 * rebuild on the first build after this lands, then normal cache reuse until
 * the pin contents change.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const PinnedRustToolchain: Schema.Struct<{
    readonly name: Schema.Literal<"pinned">;
    readonly pin: Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>;
    readonly rustup: Schema.NonEmptyString;
    readonly cargo: Schema.NonEmptyString;
}>;
/**
 * One toolchain obtained from a checked-in `rustup` pin.
 *
 * @category models
 * @since 0.1.0
 */
export type PinnedRustToolchain = typeof PinnedRustToolchain.Type;
/**
 * Schema for one declared Rust toolchain.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const RustToolchain: Schema.Union<readonly [Schema.Struct<{
    readonly name: Schema.Literal<"pinned">;
    readonly pin: Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>;
    readonly rustup: Schema.NonEmptyString;
    readonly cargo: Schema.NonEmptyString;
}>]>;
/**
 * One declared Rust toolchain.
 *
 * @category models
 * @since 0.1.0
 */
export type RustToolchain = typeof RustToolchain.Type;
/**
 * Options accepted by {@link Pinned}.
 *
 * @category models
 * @since 0.1.0
 */
export interface PinnedOptions {
    /** @default Input.file("//rust-toolchain.toml") */
    readonly pin?: Input.File | undefined;
    /** @default "rustup" */
    readonly rustup?: string | undefined;
    /** @default "cargo" */
    readonly cargo?: string | undefined;
}
/**
 * Declares the toolchain a checked-in `rustup` pin fixes.
 *
 * @example
 * ```ts
 * import { Smithers } from "@smthrs/targets"
 *
 * export const rust = Smithers.Rust.Pinned({})
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Pinned: (options?: PinnedOptions) => PinnedRustToolchain;
/**
 * Builds the argv that installs the declared toolchain.
 *
 * A bare `rustup toolchain install` reads the pin, so the components and
 * targets the pin names are installed with it and nothing restates them.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const install: (toolchain: RustToolchain) => Array<string>;
/**
 * Builds the argv that runs one cargo subcommand under the declared toolchain.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const cargo: (toolchain: RustToolchain, args: ReadonlyArray<string>) => Array<string>;
/**
 * Schema for the workspace Rust toolchain layer, `S.Rust.Toolchain`.
 *
 * The layer is what a Cargo workspace declares instead of a JavaScript
 * runtime and package manager: it names the cargo and rustup executables
 * every `S.Cargo.*` target resolves against, and the pin that fixes their
 * version. Two forms exist because two design partners pin differently. A
 * repository with a checked-in `rust-toolchain.toml` names that file
 * (`toolchain`) and, when it commits one, its lockfile; a repository whose CI
 * pins the channel by hand names the channel as declared text (`channel`)
 * beside the workspace manifest the pin applies to. Exactly one of the two is
 * present, so a declaration can never say two different things about which
 * compiler runs.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const ToolchainDeclaration: Schema.TaggedStruct<"RustToolchain", {
    readonly workspace: Schema.optional<Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>>;
    readonly channel: Schema.optional<Schema.NonEmptyString>;
    readonly toolchain: Schema.optional<Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>>;
    readonly lockfile: Schema.optional<Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>>;
    readonly versions: Schema.optional<Schema.declare<{
        readonly _tag: string;
    }, {
        readonly _tag: string;
    }>>;
    readonly rustup: Schema.NonEmptyString;
    readonly cargo: Schema.NonEmptyString;
}>;
/**
 * One declared workspace Rust toolchain layer.
 *
 * @category models
 * @since 0.1.0
 */
export type ToolchainDeclaration = typeof ToolchainDeclaration.Type;
/**
 * Options accepted by {@link Toolchain}.
 *
 * @category models
 * @since 0.1.0
 */
export interface ToolchainOptions {
    /** The Cargo workspace manifest the pin applies to. */
    readonly workspace?: Input.File | undefined;
    /** The channel this workspace pins as declared text, for example `"1.91"`. */
    readonly channel?: string | undefined;
    /** The checked-in `rustup` pin file. */
    readonly toolchain?: Input.File | undefined;
    /** The committed lockfile, when the repository commits one. */
    readonly lockfile?: Input.File | undefined;
    /** An enclosing Mise/Nix version authority. */
    readonly versions?: {
        readonly _tag: string;
    } | undefined;
    /** @default "rustup" */
    readonly rustup?: string | undefined;
    /** @default "cargo" */
    readonly cargo?: string | undefined;
}
/**
 * Declares the workspace Rust toolchain layer.
 *
 * @example
 * ```ts
 * import { Smithers as S } from "@smthrs/targets"
 *
 * const rust = S.Rust.Toolchain({ workspace: S.file("//Cargo.toml"), channel: "1.91" })
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Toolchain: (options?: ToolchainOptions) => ToolchainDeclaration;
/**
 * Checks whether a value is a workspace Rust toolchain layer declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isToolchainDeclaration: (value: unknown) => value is ToolchainDeclaration;
/**
 * Builds the argv that installs the declared toolchain layer.
 *
 * The channel form names the channel, so a host without it installs exactly
 * what the workspace pinned. The pin-file form installs bare: `rustup` reads
 * the file and brings the components and targets it names with it.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const toolchainInstall: (declaration: ToolchainDeclaration) => ReadonlyArray<string>;
/**
 * The declared files a toolchain layer contributes as key material.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const toolchainInputs: (declaration: ToolchainDeclaration) => ReadonlyArray<Input.File>;
/**
 * The key-material identity of one toolchain layer: what fixes the compiler,
 * without the executable paths the planner resolves separately.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const toolchainIdentity: (declaration: ToolchainDeclaration) => unknown;
