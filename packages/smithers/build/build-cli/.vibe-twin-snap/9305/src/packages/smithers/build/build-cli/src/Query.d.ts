/**
 * Target query result models and rendering.
 *
 * @since 0.1.0
 */
import type * as Target from "@smthrs/targets/Target";
import * as Ansi from "./Ansi.ts";
import type * as Planner from "./Planner.ts";
/**
 * Result of a bare label or pattern query.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface Listing {
    readonly query: string;
    readonly targets: ReadonlyArray<{
        readonly label: string;
        readonly target: string;
        readonly kinds: ReadonlyArray<Target.Kind>;
        /** The declaration's one-line summary ({@link Target.Presentation}), when it carries one. */
        readonly summary?: string | undefined;
        /** Present and true when the declaration marks the target featured. */
        readonly featured?: boolean | undefined;
        /**
         * Why a `Repo.Target` row resolved to nothing, when it did.
         */
        readonly refusal?: string | undefined;
    }>;
}
/**
 * Result of a `deps(label)` query.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export interface Dependencies {
    readonly query: string;
    readonly root: string;
    readonly dependencies: ReadonlyArray<string>;
    readonly edges: ReadonlyArray<Planner.Edge>;
}
/**
 * Result of an `rdeps(label)` query: every labeled target that depends on
 * the root, transitively.
 *
 * @category models
 * @since 0.1.0
 */
export interface Dependents {
    readonly query: string;
    readonly root: string;
    readonly dependents: ReadonlyArray<string>;
}
/**
 * Result of an `owners(label)` query: the owners of the package holding the
 * label, with reasons, plus the packages it depends on.
 *
 * @category models
 * @since 0.1.0
 */
export interface PackageOwners {
    readonly query: string;
    readonly package: string;
    readonly owners: ReadonlyArray<{
        readonly owner: string;
        readonly role: string;
        readonly reasons: ReadonlyArray<string>;
    }>;
    readonly agentPolicy: string;
    readonly upstream: ReadonlyArray<string>;
}
/**
 * Renders a query result for a person: a listing as aligned `LABEL TARGET
 * KINDS` columns, and `deps(label)` as the root followed by what it depends
 * on. With the default palette the text carries no escape sequences.
 *
 * @category formatting
 * @since 0.1.0
 */
export declare const text: (result: Listing | Dependencies | Dependents | PackageOwners, style?: Ansi.Palette) => string;
