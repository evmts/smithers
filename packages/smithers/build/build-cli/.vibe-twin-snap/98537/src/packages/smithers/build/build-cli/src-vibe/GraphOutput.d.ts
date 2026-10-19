/**
 * Human-readable target graph renderers.
 *
 * Every renderer takes an optional palette. With the default, {@link Ansi.none},
 * the text is exactly what the structured `graph` field carries, so a
 * terminal and a pipe see the same tree and only the terminal sees colour.
 *
 * @since 0.1.0
 */
import * as Ansi from "./Ansi.js";
/**
 * One build-system node as {@link packageText} lists it.
 *
 * @category models
 * @since 0.1.0
 */
export interface PackageRow {
    readonly label: string;
    readonly target: string;
    /** Why a `Repo.Target` row resolved to nothing, when it did. */
    readonly refusal?: string | undefined;
}
/**
 * One build-system edge as {@link packageText} lists it.
 *
 * @category models
 * @since 0.1.0
 */
export interface PackageEdge {
    readonly from: string;
    readonly to: string;
    readonly kind: string;
}
/**
 * Renders the build-system graph: every selected label, each followed by its
 * outgoing edges as `-kind-> label` lines.
 *
 * @category formatting
 * @since 0.1.0
 */
export declare const packageText: (rows: ReadonlyArray<PackageRow>, edges: ReadonlyArray<PackageEdge>, style?: Ansi.Palette) => string;
/**
 * Renders the build-system graph as Mermaid: one node per selected label and
 * one arrow per edge, labeled with the edge kind.
 *
 * The `graph --mermaid` flag used to be accepted and dropped in the build system,
 * which printed the text tree under a `format: "text"` envelope. Node ids are
 * hex-encoded labels, so no label text can reach the flowchart's grammar.
 *
 * @category formatting
 * @since 0.1.0
 */
export declare const packageMermaid: (rows: ReadonlyArray<PackageRow>, edges: ReadonlyArray<PackageEdge>) => string;
