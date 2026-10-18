/**
 * Declared JavaScript runtime for PACKAGE.ts targets.
 *
 * A runtime declaration names which interpreter a workspace runs its tools
 * under, and the version it requires. It is inert data: the constructors
 * perform no I/O, so PACKAGE.ts evaluation stays pure.
 *
 * The declaration exists because the interpreter is key material. `node -e`
 * and `bun -e` do not evaluate the same program, and two Node versions do not
 * produce the same `tsc` output. Before this module every target spelled `node`
 * into its own argv, which made the interpreter an undeclared ambient fact
 * that no key covered and no PACKAGE.ts file could change.
 *
 * Classic declarations enumerate the reviewed workspace floors. Tagged
 * resolved declarations also carry exact pins and manifest requirements through
 * the same target schemas. Every variant names its interpreter explicitly;
 * resolving a manifest never changes which program a target selects.
 *
 * A declaration is a requirement, not a measurement. `packages/smithers/build`
 * carries the matching `Runtime` service, which measures the host interpreter
 * and refuses to execute when it does not satisfy what the workspace declared.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import * as Input from "./Input.ts";
import * as Reference from "./Reference.ts";
/**
 * Schema for the supported JavaScript runtimes.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Name: Schema.Literals<readonly ["node", "bun"]>;
/**
 * The supported JavaScript runtimes.
 *
 * @category models
 * @since 0.1.0
 */
export type Name = typeof Name.Type;
/**
 * Maximum length of a declared executable name.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumExecutableLength = 256;
/**
 * Schema for the Node version requirements this workspace supports.
 *
 * The single entry matches the root `package.json` `engines.node`. A workspace
 * that wants another floor adds it here, which is the point: the set of
 * requirements a PACKAGE.ts file may write is reviewed, not free text.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const NodeVersion: Schema.Literals<readonly [">=26.4.0"]>;
/**
 * The Node version requirements this workspace supports.
 *
 * @category models
 * @since 0.1.0
 */
export type NodeVersion = typeof NodeVersion.Type;
/**
 * Schema for the Bun version requirements this workspace supports.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const BunVersion: Schema.Literals<readonly [">=1.4.0"]>;
/**
 * The Bun version requirements this workspace supports.
 *
 * @category models
 * @since 0.1.0
 */
export type BunVersion = typeof BunVersion.Type;
/**
 * Schema for a declared Node runtime.
 *
 * `executable` is what gets spawned; it defaults to the runtime name and is
 * overridable for hosts that install an interpreter under another name.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const NodeRuntime: Schema.Struct<{
    readonly name: Schema.Literal<"node">;
    readonly version: Schema.Literals<readonly [">=26.4.0"]>;
    readonly executable: Schema.NonEmptyString;
}>;
/**
 * One declared Node runtime.
 *
 * @category models
 * @since 0.1.0
 */
export type NodeRuntime = typeof NodeRuntime.Type;
/**
 * Schema for a declared Bun runtime.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const BunRuntime: Schema.Struct<{
    readonly name: Schema.Literal<"bun">;
    readonly version: Schema.Literals<readonly [">=1.4.0"]>;
    readonly executable: Schema.NonEmptyString;
}>;
/**
 * One declared Bun runtime.
 *
 * @category models
 * @since 0.1.0
 */
export type BunRuntime = typeof BunRuntime.Type;
/**
 * A bounded printable requirement resolved from a workspace declaration.
 * The runtime service verifies its exact-version or single-comparator syntax.
 *
 * @category schemas
 * @since 1.0.0
 */
export declare const VersionRequirement: Schema.NonEmptyString;
/**
 * Schema for a Node requirement resolved from a literal or manifest.
 *
 * @category schemas
 * @since 1.0.0
 */
export declare const ResolvedNodeRuntime: Schema.TaggedStruct<"ResolvedNodeRuntime", {
    readonly name: Schema.Literal<"node">;
    readonly version: Schema.NonEmptyString;
    readonly executable: Schema.NonEmptyString;
}>;
/**
 * One resolved Node runtime.
 *
 * @category models
 * @since 1.0.0
 */
export type ResolvedNodeRuntime = typeof ResolvedNodeRuntime.Type;
/**
 * Schema for a Bun requirement resolved from an exact workspace pin.
 *
 * @category schemas
 * @since 1.0.0
 */
export declare const ResolvedBunRuntime: Schema.TaggedStruct<"ResolvedBunRuntime", {
    readonly name: Schema.Literal<"bun">;
    readonly version: Schema.NonEmptyString;
    readonly executable: Schema.NonEmptyString;
}>;
/**
 * One resolved Bun runtime.
 *
 * @category models
 * @since 1.0.0
 */
export type ResolvedBunRuntime = typeof ResolvedBunRuntime.Type;
/**
 * Schema for one declared JavaScript runtime.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Runtime: Schema.Union<readonly [Schema.Struct<{
    readonly name: Schema.Literal<"node">;
    readonly version: Schema.Literals<readonly [">=26.4.0"]>;
    readonly executable: Schema.NonEmptyString;
}>, Schema.Struct<{
    readonly name: Schema.Literal<"bun">;
    readonly version: Schema.Literals<readonly [">=1.4.0"]>;
    readonly executable: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"ResolvedNodeRuntime", {
    readonly name: Schema.Literal<"node">;
    readonly version: Schema.NonEmptyString;
    readonly executable: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"ResolvedBunRuntime", {
    readonly name: Schema.Literal<"bun">;
    readonly version: Schema.NonEmptyString;
    readonly executable: Schema.NonEmptyString;
}>]>;
/**
 * One declared JavaScript runtime.
 *
 * @category models
 * @since 0.1.0
 */
export type Runtime = typeof Runtime.Type;
/**
 * Options accepted by a runtime constructor.
 *
 * `Version` is the variant's own enumeration, so an unsupported requirement is
 * a type error at the call site rather than a throw at evaluation.
 *
 * @category models
 * @since 0.1.0
 */
export interface Options<Version extends string> {
    /** The version requirement the workspace declares. */
    readonly version: Version;
    /** @default the runtime name */
    readonly executable?: string | undefined;
}
/**
 * Schema for the WORKSPACE.ts Node runtime declaration.
 *
 * The Artsy workspace API pins the runtime either to a literal version
 * (`S.Runtime.Node({ version: "26" })`) or derives it from a manifest's
 * `engines` field (`S.Runtime.Node({ manifest: packageJson })`). The two
 * options are an exclusive union.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const NodeDeclaration: Schema.TaggedStruct<"NodeRuntimeDeclaration", {
    readonly version: Schema.optional<Schema.NonEmptyString>;
    readonly manifest: Schema.optional<Schema.TaggedStruct<"File", {
        readonly path: Schema.NonEmptyString;
    }>>;
}>;
/**
 * One WORKSPACE.ts Node runtime declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type NodeDeclaration = typeof NodeDeclaration.Type;
/**
 * Checks whether a value is a WORKSPACE.ts Node runtime declaration.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isNodeDeclaration: (value: unknown) => value is NodeDeclaration;
/** A WORKSPACE/PACKAGE declaration for an exact Bun toolchain version.
 *
 * @category targets
 * @since 0.1.0
 */
export declare const BunDeclaration: Schema.TaggedStruct<"BunRuntimeDeclaration", {
    readonly version: Schema.NonEmptyString;
    readonly executable: Schema.NonEmptyString;
}>;
/** One exact-version Bun declaration outside the BUILD-era enumeration.
 *
 * @category targets
 * @since 0.1.0
 */
export type BunDeclaration = typeof BunDeclaration.Type;
/** Checks whether a value is an exact-version Bun declaration.
 *
 * @category targets
 * @since 0.1.0
 */
export declare const isBunDeclaration: (value: unknown) => value is BunDeclaration;
/**
 * Declares Node as the workspace runtime.
 *
 * The PACKAGE.ts form (`{ version: ">=26.4.0" }`, one of the reviewed
 * {@link NodeVersion} requirements) keeps returning the classic
 * {@link NodeRuntime}. The WORKSPACE.ts forms — an exclusive
 * `{ manifest }` | `{ version }` union with a free-form version string —
 * return a branded {@link NodeDeclaration}.
 *
 * @example
 * ```ts
 * import { Smithers } from "@smthrs/targets"
 *
 * export const runtime = Smithers.Runtime.Node({ version: ">=26.4.0" })
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export declare function Node(options: Options<NodeVersion>): NodeRuntime;
export declare function Node(options: {
    readonly manifest: Input.File;
    readonly version?: never;
} | {
    readonly version: string;
    readonly manifest?: never;
}): NodeDeclaration;
/**
 * The workspace runtime's own binary as an inert tool reference,
 * `S.Runtime.bin`.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const bin: Reference.RuntimeBin;
/**
 * References a one-shot npx tool run under the workspace runtime,
 * `S.Runtime.npx(spec)`.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const npx: typeof Reference.runtimeNpx;
/**
 * Declares Bun as the workspace runtime.
 *
 * @example
 * ```ts
 * import { Smithers } from "@smthrs/targets"
 *
 * export const runtime = Smithers.Runtime.Bun({ version: ">=1.4.0" })
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export declare function Bun(options: Options<BunVersion>): BunRuntime;
export declare function Bun(options: Options<string>): BunRuntime | ResolvedBunRuntime;
/**
 * Checks whether a value is a declared runtime.
 *
 * The guard is the schema itself, so it admits exactly the values a
 * constructor or resolver can produce: a supported `name`, a reviewed legacy
 * requirement or a tagged resolved requirement, and a non-empty `executable`.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isRuntime: (value: unknown) => value is Runtime;
/**
 * The runtime a rule spawns under, refusing an unresolved one.
 *
 * The three argv builders below take `Runtime | undefined` because a
 * PACKAGE.ts no longer writes the interpreter: the workspace declares it once
 * and the executor fills the attr in before it runs the body. `undefined`
 * therefore means the workspace declared no runtime at all, which is a refusal
 * with a name rather than a spawn of whatever is on PATH.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const required: (runtime: Runtime | undefined) => Runtime;
/**
 * Builds the argv that runs one script under the declared runtime.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const run: (runtime: Runtime | undefined, args: ReadonlyArray<string>) => Array<string>;
/**
 * Builds the argv that evaluates one inline program under the declared
 * runtime.
 *
 * Both supported runtimes spell inline evaluation as `-e`. A target that needs
 * a throwaway program calls this rather than spelling an interpreter flag into
 * its own argv.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const evaluate: (runtime: Runtime | undefined, program: string, args?: ReadonlyArray<string>) => Array<string>;
/**
 * Builds the argv that runs declared test files under the runtime's own test
 * runner.
 *
 * Both supported runtimes ship one, and each spells it differently: Node takes
 * `--test` before the files, Bun takes a `test` subcommand. A target that runs
 * a test file calls this rather than spelling an interpreter flag into its own
 * argv, which is what lets the workspace switch interpreters by editing one
 * declaration.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const test: (declared: Runtime | undefined, files: ReadonlyArray<string>, options?: {
    readonly isolate?: boolean | undefined;
}) => Array<string>;
