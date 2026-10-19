/**
 * Target graph planning and content cache keys.
 *
 * @since 0.1.0
 */
import * as Input from "@smthrs/targets/Input";
import * as Target from "@smthrs/targets/Target";
import type * as Workspace from "./Workspace.js";
/**
 * One direct target dependency edge.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface Edge {
    readonly from: string;
    readonly to: string;
}
/**
 * The four cache-key material fields defined by the Smithers step-key law.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface KeyMaterial {
    readonly body: unknown;
    readonly inputs: unknown;
    readonly layers: ReadonlyArray<string>;
    readonly capabilities: ReadonlyArray<string>;
}
/**
 * One target in dependency-first plan order.
 *
 * `attrs` are the verb-effective attrs from `Target.Metadata.forKind`: what the
 * executor passes to the target Flow. A generator target maps the `lint` verb
 * to its drift-check form here, so its key material, declared inputs, and
 * cacheability differ between `build` and `lint` plans.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface PlannedTarget {
    readonly label: string;
    readonly target: string;
    readonly kinds: ReadonlyArray<Target.Kind>;
    readonly attrs: unknown;
    readonly dependencies: ReadonlyArray<string>;
    readonly declaredInputs: ReadonlyArray<Workspace.ExpandedInput>;
    /**
     * The target's declared output roots for the verb being planned, or undefined
     * for a target that declares none. It is target metadata, never a value read back
     * out of attrs, so a cached entry cannot choose which paths get verified.
     */
    readonly declaredOutputs: Target.DeclaredOutputs | undefined;
    readonly cacheable: boolean;
    readonly cacheLookup: "not-wired";
    readonly wouldRun: true;
    readonly keyMaterial: KeyMaterial;
    readonly keyPreview: string;
    /**
     * The resolved Nix environment the target's tools run from, when its
     * package declares one and the verb executes. The store hash is already
     * in `keyMaterial.layers` as `nix:<hash>`; `closure` is every store path
     * the environment references, so a sandbox can bind-mount exactly the
     * toolchain the key names as its read set.
     */
    readonly nixEnvironment?: PlannedEnvironment | undefined;
}
/**
 * The resolved Nix environment recorded on a planned target.
 *
 * @category models
 * @since 0.1.0
 */
export interface PlannedEnvironment {
    readonly storePath: string;
    readonly hash: string;
    readonly closure: ReadonlyArray<string>;
    readonly path: ReadonlyArray<string>;
    readonly variables: Readonly<Record<string, string>>;
}
/**
 * A complete inert target plan.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface Plan {
    readonly verb: Target.Kind | "graph" | "query";
    readonly pattern: string;
    readonly roots: ReadonlyArray<string>;
    readonly targets: ReadonlyArray<PlannedTarget>;
    readonly edges: ReadonlyArray<Edge>;
    readonly warnings: ReadonlyArray<string>;
}
/**
 * Global cache-key salt for executor semantics.
 *
 * Increment this integer whenever execution or cache-admission semantics
 * change without otherwise changing target key material. Bumped to 3 when key
 * encoding became type tagged and injective and cache admission started
 * enforcing target identity, exact declared outputs, and input revalidation.
 * Version 5 removes timing from semantic exec results, narrows inherited tool
 * environments, and makes custom targets non-cacheable unless they opt in.
 *
 * @category keys
 * @since 0.1.0
 * @slop
 */
export declare const EXECUTION_FORMAT = 5;
declare const KeyMaterialError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/KeyMaterialError";
} & Readonly<A>;
/**
 * Orders strings by UTF-16 code unit. `localeCompare` answers differently
 * under different host locales and ICU versions, which would let one target
 * hash to different cache keys on different machines; code-unit order is the
 * same everywhere.
 */
/**
 * One value in key material could not be encoded injectively.
 *
 * The encoder never guesses. Material it cannot represent without losing the
 * distinction between two different values fails the plan, because a key that
 * two different actions can share is worse than no key at all.
 *
 * @category errors
 * @since 0.1.0
 * @slop
 */
export declare class KeyMaterialError extends KeyMaterialError_base<{
    readonly path: string;
    readonly message: string;
}> {
    constructor(path: string, reason: string);
}
declare const UnsupportedVerbError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "smithers-build/UnsupportedVerbError";
} & Readonly<A>;
/**
 * An exact target exists but does not participate in the requested verb.
 *
 * `ci` uses this type to ignore only the expected per-verb refusal while it
 * merges the other verb plans. Matching error text would also swallow an
 * unrelated planner or filesystem failure that happened to contain the same
 * words.
 *
 * @category errors
 * @since 0.1.0
 * @slop
 */
export declare class UnsupportedVerbError extends UnsupportedVerbError_base<{
    readonly pattern: string;
    readonly verb: Target.Kind;
    readonly message: string;
}> {
    constructor(pattern: string, verb: Target.Kind);
}
/**
 * Encodes key material into the injective byte string {@link keyOf} hashes.
 *
 * Exported so the encoding itself stays directly testable.
 *
 * @category keys
 * @since 0.1.0
 * @slop
 */
export declare const encodeKeyMaterial: (material: KeyMaterial) => string;
/**
 * Hashes key material into the sha256 content key an executor caches on.
 *
 * The encoding is type tagged, length delimited, and injective, and object
 * keys sort by code unit, so equal material always hashes to the same key on
 * every host while values of different types never collide. Material the
 * encoding cannot represent exactly raises a {@link KeyMaterialError} rather
 * than hashing an approximation of it.
 *
 * @category keys
 * @since 0.1.0
 * @slop
 */
export declare const keyOf: (material: KeyMaterial) => string;
/**
 * Builds the persistent body identity for one target.
 *
 * `Target.Metadata.implementationDigest` is deliberately absent. It contains
 * process-local entropy for ordinary closures, so persisting it makes equal
 * declarations miss across processes. The ambient implementation fingerprint
 * covers the shipped source bytes that implement every catalog target.
 *
 * @category keys
 * @since 0.1.0
 * @slop
 */
export declare const targetKeyBody: (target: Target.AnyTarget, metadata: Target.Metadata, outputs: Target.DeclaredOutputs | undefined) => unknown;
/**
 * One source tree that contributes to the implementation fingerprint.
 *
 * `name` is the logical prefix recorded in the digest. `directory` is the host
 * path the bytes are read from and never reaches the digest.
 *
 * @category keys
 * @since 0.1.0
 * @slop
 */
export interface SourceRoot {
    readonly name: string;
    readonly directory: string;
}
/**
 * Maximum bytes admitted from one implementation source file.
 *
 * @category limits
 * @since 0.1.0
 * @slop
 */
export declare const maximumSourceFileBytes: number;
/**
 * Digests the bytes of the implementation that will execute the plan.
 *
 * Only logical names — the root's name plus the tree-relative path — and file
 * bytes enter the digest, never an absolute path, so two checkouts of the same
 * sources at different locations produce the same fingerprint and can share a
 * cache. An absent tree contributes a distinct `absent` marker rather than
 * silently contributing nothing.
 *
 * @category keys
 * @since 0.1.0
 * @slop
 */
export declare const fingerprintSources: (roots: ReadonlyArray<SourceRoot>, options?: {
    readonly signal?: AbortSignal | undefined;
}) => Promise<string>;
/**
 * The source trees whose bytes decide what an execution actually does: the CLI
 * that schedules and admits, the target catalog, the execution libraries, and
 * the pinned runtime dependencies they load.
 *
 * @category keys
 * @since 0.1.0
 * @slop
 */
export declare const productionSourceRoots: () => ReadonlyArray<SourceRoot>;
/**
 * The memoized fingerprint of the loaded implementation sources.
 *
 * `Target.Metadata.implementationDigest` distinguishes callback identity within
 * one process and includes process-local entropy for ordinary closures, so it
 * cannot be a persistent cache identity. It is also blind to every helper those
 * functions call, every action layer that implements their nodes, and the
 * executor's own admission logic. This fingerprint is the persistent identity:
 * it changes whenever any byte of the shipped implementation changes, with no
 * salt to remember to bump.
 *
 * @category keys
 * @since 0.1.0
 * @slop
 */
export declare const implementationFingerprint: (signal?: AbortSignal | undefined) => Promise<string>;
/**
 * Canonicalizes target attrs into key material: target references become
 * dependency keys and declared inputs become content digests.
 *
 * Exported for the build-system planner, so both planners canonicalize attrs
 * identically and every key still flows through the one injective encoder.
 *
 * @category keys
 * @since 0.1.0
 * @slop
 */
export declare const attrsValue: (value: unknown, depKeys: ReadonlyMap<Target.AnyTarget, string>, inputDigests: ReadonlyMap<Input.Declared, string>, seen?: Set<object>, path?: string) => unknown;
export {};
/** Targets whose execution resolves a package-manager and runtime layer. */
