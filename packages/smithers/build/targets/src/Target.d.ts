/**
 * Opaque build declarations with an explicit plan-lowering boundary.
 *
 * @since 0.1.0
 */
import { Action, type Flow, type FlowRuntime } from "@smthrs/flow";
import * as Node from "@smthrs/plan/Node";
import type * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Input from "./Input.ts";
/**
 * CLI verbs a target can participate in.
 *
 * `docs` is the documentation-parity verb. It remains independently
 * addressable and also participates in the aggregate `ci` command.
 *
 * `run` and `review` do not. `run` is the manual verb, and `review` is the
 * model-assisted one: a review target spawns a model CLI against the diff of
 * the checkout it runs in, which is neither a reproducible function of its
 * inputs nor something a hosted runner has the binary or the credential for.
 * A target that declares `review` alone is therefore invisible to
 * `lint`, `ci`, `test`, and `build` over a wildcard, and reachable only
 * through `smithers-build review` or its exact label.
 *
 * @category models
 * @since 0.1.0
 */
export declare const Kind: Schema.Literals<readonly ["build", "test", "lint", "run", "docs", "review"]>;
/**
 * CLI verbs a target can participate in.
 *
 * @category models
 * @since 0.1.0
 */
export type Kind = typeof Kind.Type;
/**
 * Whether validated target attrs require an exclusive execution window.
 *
 * Rules opt into this tier with an `exclusive` boolean attr. Wildcard test
 * and CI selections omit these targets unless explicitly opted in; once
 * selected, each runs alone within its executor invocation.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isExclusive: (attrs: unknown) => boolean;
/**
 * Runtime marker shared by source and installed copies of this package.
 *
 * @category type ids
 * @since 0.1.0
 */
export declare const TargetTypeId: unique symbol;
/**
 * The output tree a target promises one execution will produce.
 *
 * `cwd` is the workspace-relative directory the declared paths resolve
 * against, and `paths` is the complete, ordered list of them. This is target
 * metadata rather than something read back out of attrs at admission time: an
 * untrusted cache entry must never get to choose which paths are verified, and
 * an implementation must not get to decide after the fact that it produced
 * fewer outputs than it declared.
 *
 * @category models
 * @since 0.1.0
 */
export interface DeclaredOutputs {
    readonly cwd: string;
    readonly paths: ReadonlyArray<string>;
}
/**
 * Returns the reason one declared output path is unusable, or undefined.
 *
 * This is the single definition of a legal declaration. Target metadata applies
 * it when a target is constructed, and execution applies it again to the paths
 * that arrive in an action payload or a cache entry.
 *
 * @category validation
 * @since 0.1.0
 */
export declare const declaredOutputFailure: (cwd: string, path: string) => string | undefined;
/**
 * Returns the reason one declared output set is unusable, or undefined.
 *
 * A duplicate is refused because the manifest contract is an exact, positional
 * match: a target that names one output twice could never be satisfied by a
 * manifest that also refuses duplicates. Duplication is judged after the
 * declarations resolve, so `dist` and `./dist` collide, and so do names that
 * differ only in Unicode normal form or letter case. An overlap is refused
 * for the same reason one step out: `dist` and `dist/index.js` would put one
 * file in the manifest twice, under two different digests that no longer have
 * to agree.
 *
 * @category validation
 * @since 0.1.0
 */
export declare const declaredOutputsFailure: (value: DeclaredOutputs) => string | undefined;
/**
 * Validates one declared output set, or throws naming the target that declared
 * it.
 *
 * @category validation
 * @since 0.1.0
 */
export declare const declaredOutputs: (target: string, value: DeclaredOutputs) => DeclaredOutputs;
/**
 * The attrs, declared inputs, declared outputs, and cacheability one verb sees
 * for a target.
 *
 * @category models
 * @since 0.1.0
 */
export interface KindView {
    readonly attrs: unknown;
    readonly dependencies: ReadonlyArray<AnyTarget>;
    /** Workspace targets selected without importing their PACKAGE.ts modules. */
    readonly dependencySelectors: ReadonlyArray<DependencySelector>;
    readonly inputs: ReadonlyArray<Input.Declared>;
    readonly cacheable: boolean;
    readonly outputs: DeclaredOutputs | undefined;
}
/**
 * An attr a rule resolves from the workspace declaration.
 *
 * The workspace declares the package manager and the runtime once, in
 * `WORKSPACE.ts`. A rule that names one of these here is telling the executor
 * to fill it from that declaration whenever a PACKAGE.ts omits it, which is
 * what keeps the tool identity out of every package's declaration file. A
 * declaration that passes the attr explicitly still wins: that is how a
 * package runs its suite under a second interpreter.
 *
 * @category models
 * @since 0.1.0
 */
export type WorkspaceAttr = "packageManager" | "runtime";
/**
 * How a declaration presents its target to a person: the one-line `summary`
 * a listing or the app shows under the label, and whether the target is
 * `featured` (an essential of its repository, leading the app's Featured
 * view). Both ride the declaration itself (`Smithers.Vitest({ ...,
 * summary: "..." })`) so the prose lives beside the target it describes;
 * the label is never declared, it is the package path and export name.
 * Neither is an attr: they do not reach the schema, the plan, or the cache
 * key, so annotating a target changes nothing about what it runs.
 *
 * @category models
 * @since 0.1.0
 */
export interface Presentation {
    readonly summary?: string | undefined;
    readonly featured?: boolean | undefined;
    /** Captured history requires a summary; omitted means evergreen. */
    readonly lifecycle?: "evergreen" | "artifact" | undefined;
}
/**
 * A declaration's presentation with the defaults applied: the trimmed
 * one-line summary, or undefined, and whether the declaration is featured.
 *
 * @category models
 * @since 1.0.0
 */
export interface DeclaredPresentation {
    readonly summary: string | undefined;
    readonly featured: boolean;
    readonly lifecycle?: "evergreen" | "artifact" | undefined;
}
/**
 * Separates the presentation from the attrs of one snapshotted declaration,
 * or names the reason the presentation is unusable.
 *
 * Exported so every declaration that carries a `summary` and `featured`
 * pair, a target or a `Smithers.Flow`, validates the pair through one rule.
 *
 * @category validation
 * @since 1.0.0
 */
export declare const splitPresentation: (snapshot: unknown) => {
    readonly attrs: unknown;
    readonly presentation: DeclaredPresentation;
} | string;
/**
 * Planner metadata attached to a target Flow.
 *
 * `forKind` resolves the attrs a verb executes with. A target without an
 * `attrsForKind` mapping returns the declared view for every verb. A target
 * with one, for example a generator whose `build` writes and whose `lint`
 * checks drift, returns re-derived inputs, outputs, and cacheability for the
 * mapped attrs. `implementationDigest` identifies the implementation and every
 * optional function that derives attrs, inputs, outputs, or cacheability. It
 * hashes each callback's source text, so the same definition evaluated by two
 * processes agrees; a callback built with `Node.capture` hashes its captured
 * values too, so changing a captured tool or version changes the digest.
 * Source text is not the whole implementation: an ordinary closure over a
 * value JavaScript cannot inspect keeps one digest across every value it
 * closes over, and a helper the callback calls is not hashed at all. The
 * digest is therefore stable enough to key on but too coarse to be a complete
 * content key on its own. Consumers that need one, the package executor and
 * the agent verdict cache, leave it out and key on an ambient fingerprint of
 * the shipped sources instead.
 *
 * `outputs` is the declared output tree, undefined for a target that promises
 * none. Dependencies are re-derived from verb-effective attrs and may vary by
 * verb. `verbGate`, when present, is the complete set of verbs
 * whose graph may include this target, including through a dependency edge.
 *
 * @category models
 * @since 0.1.0
 */
export interface Metadata {
    readonly target: string;
    readonly implementationDigest: string;
    /** JSON-schema identity of the payload, success, and error contracts. */
    readonly schemaIdentity: unknown;
    readonly kinds: ReadonlyArray<Kind>;
    readonly attrs: unknown;
    readonly attrsSchema: Flow.AnyStructSchema;
    /**
     * The attrs this rule resolves from the workspace declaration when the
     * declaration omits them. The executor fills each named attr from
     * `WORKSPACE.ts` before it keys and executes the node, so a PACKAGE.ts
     * never restates the workspace's package manager or runtime.
     */
    readonly workspaceAttrs: ReadonlyArray<WorkspaceAttr>;
    /** Validates an untrusted cached value against the success type in this package's Schema runtime. */
    readonly decodeSuccess: (value: unknown) => unknown;
    readonly dependencies: ReadonlyArray<AnyTarget>;
    readonly dependencySelectors: ReadonlyArray<DependencySelector>;
    readonly inputs: ReadonlyArray<Input.Declared>;
    readonly cacheable: boolean;
    readonly outputs: DeclaredOutputs | undefined;
    readonly verbGate: ReadonlyArray<Kind> | undefined;
    /** The host platforms the target runs on, or undefined for every host. */
    readonly hosts: ReadonlyArray<string> | undefined;
    /**
     * Whether a bare wildcard (`//...`, `//pkg/...`) skips the target. A label
     * or a named subtree pattern (`//pkg/...:name`) still selects it.
     */
    readonly manual: boolean;
    readonly sourceFile: string | undefined;
    /** The declaration's one-line summary, when it carries one; see {@link Presentation}. */
    readonly summary: string | undefined;
    /** Whether the declaration marks the target featured; see {@link Presentation}. */
    readonly featured: boolean;
    readonly lifecycle?: "evergreen" | "artifact" | undefined;
    readonly forKind: (kind: Kind) => KindView;
}
/**
 * An opaque build declaration. Execute it through the package executor;
 * use {@link plan} only to lower its action-backed implementation explicitly.
 *
 * @category models
 * @since 0.1.0
 */
export type Target<Id extends string = string, Attrs extends Flow.AnyStructSchema = Flow.AnyStructSchema, Success extends Schema.Top = Schema.Top, Error extends Schema.Top = Schema.Top, Requires = unknown> = {
    readonly _tag: Id;
    readonly [TargetTypeId]: Metadata;
    readonly [TargetTypes]?: {
        readonly attrs: Attrs;
        readonly success: Success;
        readonly error: Error;
        readonly requires: Requires;
    };
};
/**
 * Type-erased target used for dependency edges and discovery.
 *
 * @category models
 * @since 0.1.0
 */
export type AnyTarget = {
    readonly _tag: string;
    readonly [TargetTypeId]: Metadata;
};
declare const TargetTypes: unique symbol;
/**
 * Lowers a target's validated declaration to its action plan without executing it.
 *
 * Package-executor-only rules produce a typed NotImplemented refusal in this
 * plan. Dependencies, tool resolution and package services must be supplied by
 * the package executor; this operation does not claim to execute those rules.
 * A host can embed an action-backed target in a Flow with `body: () => plan(target)`.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const plan: <Id extends string, Attrs extends Flow.AnyStructSchema, Success extends Schema.Top, Error extends Schema.Top, Requires>(target: Target<Id, Attrs, Success, Error, Requires>, attrs?: Attrs["~type.make.in"]) => Node.Node<Success["Type"], Error["Type"], Requires>;
/**
 * Opaque Effect Schema for direct target references in target attrs.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Target: Schema.declare<AnyTarget, AnyTarget>;
/**
 * A graph dependency selected from every package below one workspace subtree.
 *
 * This is the graph-native form for aggregate PACKAGE.ts targets whose
 * dependencies include synthesized packages and therefore cannot be imported
 * as target objects. Selection is intentionally narrow: a recursive package
 * pattern plus one exact exported target name.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const DependencySelector: Schema.TaggedStruct<"TargetDependencySelector", {
    readonly pattern: Schema.NonEmptyString;
    readonly target: Schema.NonEmptyString;
}>;
/**
 * A graph dependency selected from every package below one workspace subtree.
 *
 * @category models
 * @since 0.1.0
 */
export type DependencySelector = typeof DependencySelector.Type;
/**
 * A direct target dependency or a workspace subtree selection.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Dependency: Schema.Union<readonly [Schema.declare<AnyTarget, AnyTarget>, Schema.TaggedStruct<"TargetDependencySelector", {
    readonly pattern: Schema.NonEmptyString;
    readonly target: Schema.NonEmptyString;
}>]>;
/**
 * A direct target dependency or a workspace subtree selection.
 *
 * @category models
 * @since 0.1.0
 */
export type Dependency = typeof Dependency.Type;
/**
 * Selects one exported target name from every package in a subtree.
 *
 * @example
 * ```ts
 * Smithers.Target.subtree("//packages/...", "lib")
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const subtree: (pattern: string, target: string) => DependencySelector;
declare const NotImplemented_base: Schema.Class<NotImplemented, Schema.TaggedStruct<"smithers-build/NotImplemented", {
    readonly target: Schema.NonEmptyString;
    readonly message: Schema.NonEmptyString;
}>, import("effect/Cause").YieldableError>;
/**
 * Error returned by every catalog stub when someone executes it.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class NotImplemented extends NotImplemented_base {
}
/**
 * Shared action used by catalog stubs.
 *
 * @category actions
 * @since 0.1.0
 */
export declare const NotImplementedAction: Action.Declared<"smithers-build/not-implemented", Schema.Struct<{
    target: Schema.NonEmptyString;
}>, Schema.Never, typeof NotImplemented, Action.Requirement<"smithers-build/not-implemented">>;
/**
 * Layer that turns a catalog stub node into its typed failure.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const layerNotImplemented: Layer.Layer<Action.Requirement<"smithers-build/not-implemented">, never, FlowRuntime.FlowRuntime>;
/**
 * Produces the plan node shared by catalog target stubs.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const notImplemented: (target: string) => Node.Node<never, NotImplemented, Action.Requirement<"smithers-build/not-implemented">>;
/**
 * Shared placeholder for catalog rules executed by the package executor.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const catalogNotImplemented: () => Node.Node<never, NotImplemented, Action.Requirement<"smithers-build/not-implemented">>;
/**
 * Checks whether a value is a PACKAGE.ts target.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isTarget: (value: unknown) => value is AnyTarget;
/**
 * Checks whether a value is a workspace dependency selector.
 *
 * @category guards
 * @since 0.1.0
 */
export declare const isDependencySelector: (value: unknown) => value is DependencySelector;
/**
 * Wraps a definition in a pre-validation without erasing what it is.
 *
 * A catalog rule that has to refuse something the schema cannot express — one
 * crate selector, one artifact source — used to be written as a bare arrow
 * annotated `: Target.AnyTarget`, which threw away the `id`, `attrs` schema,
 * and `kinds` that every unwrapped rule carries, and collapsed the Flow's
 * success and error types to `Schema.Top`. Half the catalog exported one shape
 * and half the other, so no tool could read a rule's attrs schema for
 * validation, documentation, or editor support without knowing which half it
 * had. This keeps one shape: the guard runs first, and the value is still a
 * {@link Definition}.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const guard: <Id extends string, Attrs extends Flow.AnyStructSchema, Success extends Schema.Top, Error extends Schema.Top, Requires>(definition: Definition<Id, Attrs, Success, Error, Requires>, validate: (attrs: Attrs["~type.make.in"]) => void) => Definition<Id, Attrs, Success, Error, Requires>;
/**
 * Restores a rule's identity on the callable the catalog exports in its place.
 *
 * A few rules cannot be exported as their {@link Definition}: one takes no
 * attrs in its BUILD-era form, another returns the target with a `files`
 * projection attached. Each was written as a bare arrow, which threw away the
 * `id`, `attrs` schema, and `kinds` that every other rule carries, so a tool
 * reading a rule's attrs schema for validation, documentation, or editor
 * support saw a hole where a rule should be. This keeps the wrapper's own
 * call signature and puts the rule identity back on it.
 *
 * Use {@link guard} instead whenever the wrapper only pre-validates: it also
 * moves the validation behind the construction boundary, which this does not.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const rule: <Id extends string, Attrs extends Flow.AnyStructSchema, Success extends Schema.Top, Error extends Schema.Top, Requires, Callable extends (...args: never) => unknown>(definition: Definition<Id, Attrs, Success, Error, Requires>, callable: Callable) => Callable & {
    readonly id: Id;
    readonly attrs: Attrs;
    readonly kinds: ReadonlyArray<Kind>;
};
/**
 * Reads the planner metadata attached by {@link make}.
 *
 * @category accessors
 * @since 0.1.0
 */
export declare const metadata: (target: AnyTarget) => Metadata;
/**
 * A callable target definition.
 *
 * @category models
 * @since 0.1.0
 */
export interface Definition<Id extends string, Attrs extends Flow.AnyStructSchema, Success extends Schema.Top, Error extends Schema.Top, Requires> {
    (attrs: Attrs["~type.make.in"] & Presentation): Target<Id, Attrs, Success, Error, Requires>;
    readonly id: Id;
    readonly attrs: Attrs;
    readonly kinds: ReadonlyArray<Kind>;
}
/**
 * Declaration-site context passed to a target implementation.
 *
 * `packageDirectory` is the absolute directory containing the declaring
 * PACKAGE.ts file. It is undefined only when a target was constructed outside a
 * PACKAGE.ts module.
 *
 * @category models
 * @since 0.1.0
 */
export interface ImplementationContext {
    readonly sourceFile: string | undefined;
    readonly packageDirectory: string | undefined;
}
type ResultSchema<S extends Schema.Top, A> = [S] extends [never] ? Schema.Schema<A> : S;
/**
 * Options accepted by {@link make}.
 *
 * @category models
 * @since 0.1.0
 */
export interface MakeOptions<Attrs extends Flow.AnyStructSchema, Success extends Schema.Top, Error extends Schema.Top, Requires> {
    readonly attrs: Attrs;
    readonly kinds: ReadonlyArray<Kind>;
    /**
     * The attrs the executor fills from the workspace declaration when the
     * declaration omits them; see {@link Metadata.workspaceAttrs}.
     */
    readonly workspaceAttrs?: ReadonlyArray<WorkspaceAttr> | undefined;
    readonly success?: Success | undefined;
    readonly error?: Error | undefined;
    readonly implementation: (attrs: Attrs["Type"], context: ImplementationContext) => Node.Node<ResultSchema<Success, unknown>["Type"], ResultSchema<Error, unknown>["Type"], Requires>;
    readonly inputs?: ((attrs: Attrs["Type"]) => ReadonlyArray<Input.Declared>) | undefined;
    /**
     * The complete output tree this target promises to produce, derived from
     * decoded attrs. A target that declares one must return a matching output
     * manifest from every successful execution; see
     * {@link ToolBuild.captureOutputs}.
     */
    readonly outputs?: ((attrs: Attrs["Type"]) => DeclaredOutputs) | undefined;
    /**
     * Whether executor results may be replayed across runs. The default is
     * false: arbitrary target bodies can consult tools, services, or host state
     * that attrs and declared inputs do not identify. A target opts in only after
     * its implementation has a complete deterministic input contract.
     */
    readonly cache?: boolean | ((attrs: Attrs["Type"]) => boolean) | undefined;
    readonly attrsForKind?: ((kind: Kind, attrs: Attrs["Type"]) => Attrs["Type"]) | undefined;
    /**
     * The host platforms, as `process.platform` names them, a declaration may
     * run on; undefined, or no option, means every host. The package planner
     * omits a restricted target from wildcard selections on other hosts and
     * refuses it by name there.
     */
    readonly hosts?: ((attrs: Attrs["Type"]) => ReadonlyArray<string> | undefined) | undefined;
    /**
     * Whether a declaration is manual: the package planner omits it from bare
     * wildcard selections (`//...`, `//pkg/...`) and selects it only by label or
     * by a named subtree pattern (`//pkg/...:name`), the way Bazel treats a
     * `manual` tag. Use it for an expensive target a person asks for by name.
     */
    readonly manual?: ((attrs: Attrs["Type"]) => boolean) | undefined;
    readonly verbGate?: ReadonlyArray<Kind> | ((attrs: Attrs["Type"]) => ReadonlyArray<Kind> | undefined) | undefined;
}
/**
 * Attrs nesting one declaration may reach.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumAttrsDepth = 64;
/**
 * Members one declaration's attrs may carry, counted across the whole tree.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumAttrsMembers = 100000;
/**
 * The PACKAGE.ts call site a declaration was written at.
 *
 * `path` alone identifies the declaring package. `line` and `column` are
 * reported back to the author when a declaration is rejected, and are absent
 * when the host does not expose them.
 */
interface SourceSite {
    readonly path: string;
    readonly line: number | undefined;
    readonly column: number | undefined;
}
/**
 * The absolute path of the `PACKAGE.ts` or `WORKSPACE.ts` file whose
 * evaluation is calling this function, or undefined when the caller is not
 * evaluating one (a test, a script). A macro uses it to locate the declaring
 * package on disk while the declaration is being planned.
 *
 * @category introspection
 * @since 1.0.0
 */
export declare const declarationSourceFile: () => string | undefined;
/**
 * Maximum UTF-16 code units of formatted schema detail admitted into one
 * declaration-rejected message.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumRejectionDetailCodeUnits: number;
/**
 * Maximum accepted keys listed in one unknown-property line before the rest
 * are elided. A struct with a long attr list would otherwise bury the
 * suggestion under its own inventory.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumListedKeys = 12;
/**
 * Maximum unknown-property lines appended to one rejection. An author who
 * mistyped a dozen keys is told about the first few and fixes the rest by the
 * same rule.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const maximumGuidanceLines = 5;
/**
 * Rejects one declaration with the target, the authoring site, and the reason.
 *
 * @category errors
 * @since 0.1.0
 */
export declare const declarationRejected: (id: string, site: SourceSite | undefined, cause: unknown) => Error;
/**
 * Creates an opaque target with validated attrs and a pure plan implementation.
 *
 * Supplied success and error schemas constrain the implementation node. An
 * omitted channel is inferred from the node and uses Unknown at runtime,
 * preserving its value without applying schema validation.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const make: <const Id extends string, Attrs extends Flow.AnyStructSchema, Success extends Schema.Top = never, Error extends Schema.Top = never, Requires = never, Implementation extends Node.Node<unknown, unknown, Requires> = Node.Node<unknown, unknown, Requires>>(id: Id, options: MakeOptions<Attrs, Success, Error, Requires> & {
    readonly implementation: (attrs: Attrs["Type"], context: ImplementationContext) => Implementation;
}) => Definition<Id, Attrs, ResultSchema<Success, Node.Success<Implementation>>, ResultSchema<Error, Node.Error<Implementation>>, Requires>;
export {};
