/**
 * Cross-cutting attr schemas shared by the PACKAGE.ts target constructors.
 *
 * One module owns the shapes every flavor reuses — `data`, `gates`,
 * `services`, `hosts`, `sandbox`, `approval`, `env`, `secrets`, `using`, and the
 * Serve probe contract — so two flavors can never drift apart on what one of
 * these attrs means. Targets inside these attrs become dependency edges and
 * declared inputs become key material through `Target.make`'s attr walk;
 * this module only validates shape.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import * as Reference from "./Reference.ts";
import * as Target from "./Target.ts";
/**
 * Schema for one entry of a `data` array: a target whose files materialize
 * before dispatch, a declared input, or an installed-module dependency
 * reference.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const DataMember: Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
    readonly pattern: Schema.NonEmptyString;
    readonly exclude: Schema.$Array<Schema.String>;
}>, Schema.TaggedStruct<"File", {
    readonly path: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"GitDiff", {
    readonly base: Schema.NonEmptyString;
    readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    readonly addedLines: Schema.optional<Schema.NonEmptyString>;
}>, Schema.TaggedStruct<"PnpmWorkspace", {
    readonly path: Schema.NonEmptyString;
}>]>, Schema.TaggedStruct<"NodeModule", {
    readonly package: Schema.NonEmptyString;
}>]>;
/**
 * One entry of a `data` array.
 *
 * @category models
 * @since 0.1.0
 */
export type DataMember = typeof DataMember.Type;
/**
 * Schema for a `data` array.
 *
 * `S.glob([...])` returns an array of declared globs, so a data entry may
 * itself be an array of members; the attr walk descends plain arrays, so
 * nothing is lost.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Data: Schema.$Array<Schema.Union<readonly [Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
    readonly pattern: Schema.NonEmptyString;
    readonly exclude: Schema.$Array<Schema.String>;
}>, Schema.TaggedStruct<"File", {
    readonly path: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"GitDiff", {
    readonly base: Schema.NonEmptyString;
    readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    readonly addedLines: Schema.optional<Schema.NonEmptyString>;
}>, Schema.TaggedStruct<"PnpmWorkspace", {
    readonly path: Schema.NonEmptyString;
}>]>, Schema.TaggedStruct<"NodeModule", {
    readonly package: Schema.NonEmptyString;
}>]>, Schema.$Array<Schema.Union<readonly [Schema.declare<Target.AnyTarget, Target.AnyTarget>, Schema.Union<readonly [Schema.TaggedStruct<"Glob", {
    readonly pattern: Schema.NonEmptyString;
    readonly exclude: Schema.$Array<Schema.String>;
}>, Schema.TaggedStruct<"File", {
    readonly path: Schema.NonEmptyString;
}>, Schema.TaggedStruct<"GitDiff", {
    readonly base: Schema.NonEmptyString;
    readonly paths: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    readonly added: Schema.optional<Schema.$Array<Schema.NonEmptyString>>;
    readonly addedLines: Schema.optional<Schema.NonEmptyString>;
}>, Schema.TaggedStruct<"PnpmWorkspace", {
    readonly path: Schema.NonEmptyString;
}>]>, Schema.TaggedStruct<"NodeModule", {
    readonly package: Schema.NonEmptyString;
}>]>>]>>;
/**
 * Schema for a `gates` array: targets that must be green immediately before
 * the consumer acts.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Gates: Schema.$Array<Schema.declare<Target.AnyTarget, Target.AnyTarget>>;
/**
 * Schema for a `services` array: Serve targets scoped to the consumer.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Services: Schema.$Array<Schema.declare<Target.AnyTarget, Target.AnyTarget>>;
/**
 * Schema for a list of host platforms, as Node's `process.platform` names
 * them.
 *
 * A Shell target's `hosts` attr uses it to name the hosts the target runs
 * on. The declaration is the same on every host, so the target index records
 * it rather than the host's answer. The package planner answers per host: a
 * wildcard selection omits the target elsewhere, and naming it refuses.
 *
 * @category schemas
 * @since 1.0.0
 */
export declare const HostPlatforms: Schema.NonEmptyArray<Schema.Literals<readonly ["linux", "darwin", "win32"]>>;
/**
 * Schema for the network destinations a download-performing target reaches:
 * lowercase DNS names, one per host a connection resolves through. A domain
 * allowlist matches the name a connection resolved through, so a CDN's CNAME
 * target is listed beside the name that aliases it, and a redirect's target
 * beside the name that redirects. Environment builders open exactly these
 * hosts; an undeclared list is refused, never replaced by a default.
 *
 * @category schemas
 * @since 1.0.0
 */
export declare const Destinations: Schema.$Array<Schema.NonEmptyString>;
/**
 * The network destinations a download-performing target reaches.
 *
 * @category models
 * @since 1.0.0
 */
export type Destinations = typeof Destinations.Type;
/**
 * Schema for the sandbox policy: the default confinement, a loopback-only
 * opening (`{ network: "loopback" }`: bind, accept, and connect on the
 * loopback interface, no egress; what a test suite that starts its own
 * local listeners needs), the full network opening (`{ network: true }`),
 * or the full opt-out (`"none"`). The declaration is key material in every
 * form.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Sandbox: Schema.Union<readonly [Schema.Literal<"none">, Schema.Struct<{
    readonly network: Schema.optional<Schema.Union<readonly [Schema.Boolean, Schema.Literal<"loopback">]>>;
}>]>;
/**
 * The sandbox policy.
 *
 * @category models
 * @since 0.1.0
 */
export type Sandbox = typeof Sandbox.Type;
/**
 * Schema for the approval attr; `"required"` is its only value.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Approval: Schema.Literal<"required">;
/**
 * Schema for a narrowed child-process environment.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Env: Schema.$Record<Schema.String, Schema.String>;
/**
 * Schema for declared secrets.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Secrets: Schema.$Array<Schema.TaggedStruct<"HttpCredential", {
    readonly secret: Schema.TaggedStruct<"Secret", {
        readonly env: Schema.NonEmptyString;
        readonly fallback: Schema.optional<Schema.NonEmptyString>;
    }>;
    readonly audiences: Schema.NonEmptyArray<Schema.NonEmptyString>;
}>>;
/**
 * Schema for the `using` map binding template names to tool references.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Using: Schema.$Record<Schema.String, Schema.Union<readonly [Schema.TaggedStruct<"NodeModuleBin", {
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
}>, Schema.declare<Reference.TargetTool, Reference.TargetTool>, Schema.TaggedStruct<"CargoBin", {}>]>>;
/**
 * Schema for everything a `bin` slot accepts: a tool reference, or a build
 * target whose declared binary is the executable.
 *
 * A build target as a tool edge is how a workspace runs a program it builds
 * itself — a generator, a compile driver, a linter it vendors. The edge is an
 * ordinary dependency, so the generator is built before its consumer runs and
 * the generator's identity is key material for everything it produced.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Executable: Schema.Union<readonly [Schema.Union<readonly [Schema.TaggedStruct<"NodeModuleBin", {
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
}>, Schema.declare<Reference.TargetTool, Reference.TargetTool>, Schema.TaggedStruct<"CargoBin", {}>]>, Schema.declare<Target.AnyTarget, Target.AnyTarget>]>;
/**
 * Everything a `bin` slot accepts.
 *
 * @category models
 * @since 0.1.0
 */
export type Executable = typeof Executable.Type;
/**
 * Schema for plain argv entries plus flag references.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Args: Schema.$Array<Schema.Union<readonly [Schema.String, Schema.TaggedStruct<"FlagRef", {
    readonly name: Schema.NonEmptyString;
}>]>>;
/**
 * Schema for the Serve readiness probe: an open port or an HTTP check with a
 * timeout.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Readiness: Schema.Union<readonly [Schema.Struct<{
    readonly port: Schema.Number;
}>, Schema.Struct<{
    readonly http: Schema.NonEmptyString;
    readonly timeout: Schema.NonEmptyString;
}>, Schema.Struct<{
    readonly exec: Schema.NonEmptyArray<Schema.NonEmptyString>;
    readonly timeout: Schema.NonEmptyString;
}>]>;
/**
 * Schema for the Serve health contract: the readiness probe repeated on an
 * interval while dependents run.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Health: Schema.Struct<{
    readonly interval: Schema.NonEmptyString;
    readonly failures: Schema.optional<Schema.Number>;
}>;
/**
 * Schema for the Serve stop contract: the graceful-exit signal and grace
 * period applied before the process group is killed.
 *
 * @category schemas
 * @since 0.1.0
 */
export declare const Stop: Schema.Struct<{
    readonly signal: Schema.NonEmptyString;
    readonly grace: Schema.NonEmptyString;
}>;
/**
 * The executable-selector attr names a Shell flavor accepts.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const executableSelectors: readonly ["bin", "bun", "command", "script"];
/**
 * Requires exactly one executable selector among the present attrs.
 *
 * The check runs before schema construction so a declaration that names two
 * programs, or none, fails with the selector rule rather than a shape
 * mismatch.
 *
 * @category validation
 * @since 0.1.0
 */
export declare const requireOneExecutable: (id: string, attrs: Record<string, unknown>, selectors?: ReadonlyArray<string>) => void;
