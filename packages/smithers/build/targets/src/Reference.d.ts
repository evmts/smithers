/**
 * Inert authoring references for PACKAGE.ts and WORKSPACE.ts declarations.
 *
 * A reference names a tool, an agent, a flag, a commit, or a payload input
 * without resolving it. Constructing one performs no I/O and never creates a
 * target: references are plain frozen records that ride inside target attrs
 * and are resolved by the executor (tools), the package index (agents,
 * flags), or the invoker (payload inputs).
 *
 * This module is a leaf: it imports nothing from the target catalog, so every
 * other module may use its schemas without creating an import cycle.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
/**
 * Schema for a package-local binary reference, `S.NodeModule.Bin(pkg, bin?)`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const NodeModuleBin: Schema.TaggedStruct<"NodeModuleBin", {
    readonly package: Schema.NonEmptyString;
    readonly bin: Schema.optional<Schema.NonEmptyString>;
}>;
/**
 * A package-local binary reference.
 *
 * @category models
 * @since 0.1.0
 */
export type NodeModuleBin = typeof NodeModuleBin.Type;
/**
 * Schema for an installed-module dependency reference, `S.NodeModule(pkg)`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const NodeModuleDep: Schema.TaggedStruct<"NodeModule", {
    readonly package: Schema.NonEmptyString;
}>;
/**
 * An installed-module dependency reference.
 *
 * @category models
 * @since 0.1.0
 */
export type NodeModuleDep = typeof NodeModuleDep.Type;
/**
 * Schema for a host binary reference, `S.Host.bin(name, { env? })`.
 *
 * `env` names a host variable holding an absolute path that selects the
 * binary instead of PATH, for a tool whose own callers read that variable.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const HostBin: Schema.TaggedStruct<"HostBin", {
    readonly name: Schema.NonEmptyString;
    readonly env: Schema.optional<Schema.String>;
}>;
/**
 * A host binary reference.
 *
 * @category models
 * @since 0.1.0
 */
export type HostBin = typeof HostBin.Type;
/**
 * Schema for the workspace package manager's own binary,
 * `S.PackageManager.bin`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const PackageManagerBin: Schema.TaggedStruct<"PackageManagerBin", {}>;
/**
 * The workspace package manager's own binary.
 *
 * @category models
 * @since 0.1.0
 */
export type PackageManagerBin = typeof PackageManagerBin.Type;
/**
 * Schema for the workspace runtime's own binary, `S.Runtime.bin`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const RuntimeBin: Schema.TaggedStruct<"RuntimeBin", {}>;
/**
 * The workspace runtime's own binary.
 *
 * @category models
 * @since 0.1.0
 */
export type RuntimeBin = typeof RuntimeBin.Type;
/**
 * Schema for the workspace Rust toolchain's cargo binary.
 *
 * The reference names no executable path: the planner resolves it against the
 * workspace `toolchains` layer, so a workspace without one refuses every cargo
 * target by name instead of running whatever `cargo` is on PATH.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const CargoBin: Schema.TaggedStruct<"CargoBin", {}>;
/**
 * The workspace Rust toolchain's cargo binary.
 *
 * @category models
 * @since 0.1.0
 */
export type CargoBin = typeof CargoBin.Type;
/**
 * Schema for an npx-style one-shot tool reference, `S.Runtime.npx(spec)`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const RuntimeNpx: Schema.TaggedStruct<"RuntimeNpx", {
    readonly spec: Schema.NonEmptyString;
}>;
/**
 * An npx-style one-shot tool reference.
 *
 * @category models
 * @since 0.1.0
 */
export type RuntimeNpx = typeof RuntimeNpx.Type;
/**
 * Schema for a tool whose version authority is the workspace's mise config.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const MiseBin: Schema.TaggedStruct<"MiseBin", {
    readonly name: Schema.NonEmptyString;
}>;
/**
 * A tool whose version authority is the workspace's mise config.
 *
 * @category models
 * @since 0.1.0
 */
export type MiseBin = typeof MiseBin.Type;
/**
 * Schema for the selected Go toolchain binary.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const GoBin: Schema.TaggedStruct<"GoBin", {}>;
/**
 * A selected Go toolchain binary reference.
 *
 * @category models
 * @since 0.1.0
 */
export type GoBin = typeof GoBin.Type;
/**
 * Schema for a versioned one-shot Go tool reference.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const GoRun: Schema.TaggedStruct<"GoRun", {
    readonly spec: Schema.NonEmptyString;
}>;
/**
 * A versioned one-shot Go tool reference.
 *
 * @category models
 * @since 0.1.0
 */
export type GoRun = typeof GoRun.Type;
/**
 * Schema for a binary supplied by a Nix development shell.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const NixBin: Schema.TaggedStruct<"NixBin", {
    readonly name: Schema.NonEmptyString;
}>;
/**
 * A binary supplied by a Nix development shell.
 *
 * @category models
 * @since 0.1.0
 */
export type NixBin = typeof NixBin.Type;
/**
 * Structural view admitted when a build target is used as a tool.
 *
 * @category models
 * @since 0.1.0
 */
export interface TargetTool {
    readonly _tag: string;
}
/**
 * Schema for a build target used as an executable tool edge.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const TargetTool: Schema.declare<TargetTool, TargetTool>;
/**
 * Schema for every executable tool reference an attrs `bin` or `using` slot
 * accepts.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Tool: Schema.Union<readonly [Schema.TaggedStruct<"NodeModuleBin", {
    readonly package: Schema.NonEmptyString;
    readonly bin: Schema.optional<Schema.NonEmptyString>;
}>, Schema.TaggedStruct<"HostBin", {
    readonly name: Schema.NonEmptyString;
    readonly env: Schema.optional<Schema.String>;
}>, Schema.TaggedStruct<"PackageManagerBin", {}>, Schema.TaggedStruct<"RuntimeBin", {}>, Schema.TaggedStruct<"RuntimeNpx", {
    readonly spec: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"MiseBin", {
    readonly name: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"GoBin", {}>, Schema.TaggedStruct<"GoRun", {
    readonly spec: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"NixBin", {
    readonly name: Schema.NonEmptyString;
}>, Schema.declare<TargetTool, TargetTool>, Schema.TaggedStruct<"CargoBin", {}>]>;
/**
 * Every executable tool reference.
 *
 * @category models
 * @since 0.1.0
 */
export type Tool = typeof Tool.Type;
/**
 * References an installed module (`S.NodeModule(pkg)`) or one of its binaries
 * (`S.NodeModule.Bin(pkg, bin?)`).
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const NodeModule: {
    (packageName: string): NodeModuleDep;
    readonly Bin: (packageName: string, bin?: string) => NodeModuleBin;
};
/**
 * References a binary the workspace `S.Host({ bins })` declaration names.
 * With `env`, an absolute path in that host variable selects the binary
 * before PATH does.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const hostBin: (name: string, options?: {
    readonly env?: string;
}) => HostBin;
/**
 * The workspace package manager's binary as an inert reference value.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const packageManagerBin: PackageManagerBin;
/**
 * The workspace runtime's binary as an inert reference value.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const runtimeBin: RuntimeBin;
/**
 * References a one-shot npx tool run under the workspace runtime.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const runtimeNpx: (spec: string) => RuntimeNpx;
/**
 * References one binary pinned by the workspace's `S.Mise` config.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const miseBin: (name: string) => MiseBin;
/**
 * References the selected Go toolchain binary.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const goBin: GoBin;
/**
 * References a versioned one-shot Go tool.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const goRun: (spec: string) => GoRun;
/**
 * References a binary supplied by a Nix development shell.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const nixBin: (name: string) => NixBin;
/**
 * Schema for a declared symlink emit value, `S.symlink(path)`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Symlink: Schema.TaggedStruct<"Symlink", {
    readonly path: Schema.NonEmptyString;
}>;
/**
 * A declared symlink emit value.
 *
 * @category models
 * @since 0.1.0
 */
export type Symlink = typeof Symlink.Type;
/**
 * Declares that a generated file is a symbolic link to `path`.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const symlink: (path: string) => Symlink;
/**
 * Schema for a git commit reference, `S.gitCommit(ref)`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const GitCommit: Schema.TaggedStruct<"GitCommit", {
    readonly ref: Schema.NonEmptyString;
}>;
/**
 * A git commit reference.
 *
 * @category models
 * @since 0.1.0
 */
export type GitCommit = typeof GitCommit.Type;
/**
 * References one git commit without invoking git.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const gitCommit: (ref: string) => GitCommit;
/**
 * Schema for a declared MCP server reachable over HTTP, `S.Mcp.Http(name, url)`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const McpHttp: Schema.TaggedStruct<"McpHttp", {
    readonly name: Schema.NonEmptyString;
    readonly url: Schema.NonEmptyString;
}>;
/**
 * A declared MCP server reachable over HTTP.
 *
 * @category models
 * @since 0.1.0
 */
export type McpHttp = typeof McpHttp.Type;
/**
 * Declared MCP servers.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const Mcp: Readonly<{
    Http: (name: string, url: string) => McpHttp;
}>;
/**
 * Schema for an agent reference, `S.Agents.<name>`.
 *
 * The reference is resolved against the workspace `S.Agents({ ... })`
 * declaration when the package index loads; an unknown name fails the graph
 * load rather than an execution.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const AgentRef: Schema.TaggedStruct<"AgentRef", {
    readonly name: Schema.NonEmptyString;
}>;
/**
 * An agent reference.
 *
 * @category models
 * @since 0.1.0
 */
export type AgentRef = typeof AgentRef.Type;
/** Inline agent declarations accepted anywhere an agent selector is used.
 *
 * @category targets
 * @since 0.1.0
 */
export declare const InlineAgent: Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
    readonly model: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"AgentCodex", {
    readonly model: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"AgentPool", {
    readonly agents: Schema.$Array<Schema.NonEmptyString>;
}>]>;
/** A workspace agent reference or an inline declaration.
 *
 * @category targets
 * @since 0.1.0
 */
export declare const AgentSelection: Schema.Union<readonly [Schema.TaggedStruct<"AgentRef", {
    readonly name: Schema.NonEmptyString;
}>, Schema.Union<readonly [Schema.TaggedStruct<"AgentClaudeCode", {
    readonly model: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"AgentCodex", {
    readonly model: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"AgentPool", {
    readonly agents: Schema.$Array<Schema.NonEmptyString>;
}>]>]>;
/** A workspace agent reference or an inline declaration.
 *
 * @category targets
 * @since 0.1.0
 */
export type AgentSelection = typeof AgentSelection.Type;
/**
 * Schema for a flag reference, `S.Flags.<name>`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const FlagRef: Schema.TaggedStruct<"FlagRef", {
    readonly name: Schema.NonEmptyString;
}>;
/**
 * A flag reference.
 *
 * @category models
 * @since 0.1.0
 */
export type FlagRef = typeof FlagRef.Type;
/**
 * Wraps a declaration constructor so property access mints inert references.
 *
 * This is the one sanctioned Proxy in the authoring surface, and it exists
 * because `S.Agents` and `S.Flags` are both a constructor
 * (`S.Agents({ ... })` in the workspace tree) and a reference surface
 * (`S.Agents.luna` in a PACKAGE.ts) whose names are workspace-defined and
 * therefore cannot be precomputed. The Proxy never reaches target attrs: a
 * property access returns a fresh frozen plain record, so `Target.make`'s
 * attr walk — which rejects Proxies outright — only ever sees inert data.
 * Symbols, function-prototype names, and names outside the reference grammar
 * fall through to the underlying function untouched.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const callableReferences: <F extends object, R>(constructor: F, make: (name: string) => R) => F & Record<string, R>;
/**
 * Schema for a required string payload input, `S.Input.String(description)`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const InputString: Schema.TaggedStruct<"InputString", {
    readonly description: Schema.NonEmptyString;
}>;
/**
 * A required string payload input.
 *
 * @category models
 * @since 0.1.0
 */
export type InputString = typeof InputString.Type;
/**
 * Schema for an enumerated payload input, `S.Input.Literals([...])`.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const InputLiterals: Schema.TaggedStruct<"InputLiterals", {
    readonly values: Schema.$Array<Schema.NonEmptyString>;
}>;
/**
 * An enumerated payload input.
 *
 * @category models
 * @since 0.1.0
 */
export type InputLiterals = typeof InputLiterals.Type;
/**
 * Schema for an optional payload input, `S.Input.Optional(inner)`.
 *
 * The inner declaration is a non-optional input spec; nesting Optional inside
 * Optional is meaningless and rejected by the union.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const InputOptional: Schema.TaggedStruct<"InputOptional", {
    readonly inner: Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
        readonly description: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"InputLiterals", {
        readonly values: Schema.$Array<Schema.NonEmptyString>;
    }>]>;
}>;
/**
 * An optional payload input.
 *
 * @category models
 * @since 0.1.0
 */
export type InputOptional = typeof InputOptional.Type;
/**
 * Schema for every payload input declaration.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const InputSpec: Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
    readonly description: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"InputLiterals", {
    readonly values: Schema.$Array<Schema.NonEmptyString>;
}>, Schema.TaggedStruct<"InputOptional", {
    readonly inner: Schema.Union<readonly [Schema.TaggedStruct<"InputString", {
        readonly description: Schema.NonEmptyString;
    }>, Schema.TaggedStruct<"InputLiterals", {
        readonly values: Schema.$Array<Schema.NonEmptyString>;
    }>]>;
}>]>;
/**
 * Every payload input declaration.
 *
 * @category models
 * @since 0.1.0
 */
export type InputSpec = typeof InputSpec.Type;
/**
 * Declares a required string payload input.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const inputString: (description: string) => InputString;
/**
 * Declares an enumerated payload input.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const inputLiterals: (values: ReadonlyArray<string>) => InputLiterals;
/**
 * Declares an optional payload input wrapping a required one.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const inputOptional: (inner: InputString | InputLiterals) => InputOptional;
/**
 * Maximum length of one target label reference.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const maximumLabelLength = 512;
/**
 * The shape of an exact target label: `//pkg/path:name` or `//:name`, the
 * one spelling that names exactly one target. Patterns (`//...`, a bare
 * `//pkg`) are not references; a declaration that wants one target says
 * which.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const labelPattern: RegExp;
/**
 * Schema for an inert target label reference, `S.label("//:ci")`.
 *
 * A factory declaration in `.smithers/FACTORY.ts` never imports a
 * `PACKAGE.ts`; it names the targets it needs by label, and the index
 * resolves the reference against the registry when a field that takes one
 * is read.
 *
 * @category schemas
 * @since 1.0.0
 */
export declare const Label: Schema.TaggedStruct<"Label", {
    readonly label: Schema.NonEmptyString;
}>;
/**
 * An inert target label reference.
 *
 * @category models
 * @since 1.0.0
 */
export type Label = typeof Label.Type;
/**
 * Declares a reference to exactly one target by its label.
 *
 * @example
 * ```ts
 * import { Smithers as S } from "@smthrs/targets"
 *
 * const ci = S.label("//:ci")
 * ```
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const label: (path: string) => Label;
