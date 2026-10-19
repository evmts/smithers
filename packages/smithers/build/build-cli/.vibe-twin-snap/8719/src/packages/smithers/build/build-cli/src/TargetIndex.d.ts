/**
 * The declaration-derived target index: one row per labeled target, built from
 * PACKAGE.ts metadata alone.
 *
 * `smithers-build index` emits it, and the root `//:targetIndex` target
 * (`@smthrs/targets/TargetIndex`) commits it as `.smithers/target-index.json`,
 * the file smithers.sh reads from the public mirror to show targets beside
 * files. A row carries only what a declaration states: the rule, the kinds,
 * the summary, the exclusive tier, the declared inputs and outputs, the
 * labeled dependencies, the declared hosts, the declared network
 * destinations, an environment toolchain's pins, and the declaring file. It
 * carries no cache key, no content digest, no line number, and no host fact,
 * so the committed file changes only when a declaration changes.
 *
 * @since 0.1.0
 */
import type * as TargetIndexRule from "@smthrs/targets/TargetIndex";
import * as Ansi from "./Ansi.ts";
import type * as PackageIndex from "./PackageIndex.ts";
/**
 * One labeled target as its declaration states it: the row shape the
 * `TargetIndex` rule checks in, so what `index` prints and what the file
 * carries are one type.
 *
 * @category models
 * @since 0.1.0
 */
export type Row = TargetIndexRule.Row;
/**
 * The index for one pattern: rows sorted by label.
 *
 * @category models
 * @since 0.1.0
 */
export interface Listing {
    readonly pattern: string;
    readonly targets: ReadonlyArray<Row>;
}
/**
 * Builds the index for every target a pattern selects.
 *
 * Nothing here plans or keys a target: the rows come from the loaded
 * declarations and the index's labeled edges, plus the repository resolution
 * a `Repo.Target` row needs to state its effective kinds or its refusal.
 * `environment` is the caller's host environment; a child repository query
 * sees it only after the workspace's cache credentials are withheld.
 *
 * @category querying
 * @since 0.1.0
 */
export declare const build: (index: PackageIndex.PackageIndex, pattern: string, environment: Readonly<Record<string, string | undefined>>, signal?: AbortSignal | undefined) => Promise<Listing>;
/**
 * Renders the index for a person: aligned `LABEL RULE KINDS` columns, the
 * outputs a row owns after an arrow, and a featured row marked with a star.
 * With the default palette the text carries no escape sequences.
 *
 * @category formatting
 * @since 0.1.0
 */
export declare const text: (listing: Listing, style?: Ansi.Palette) => string;
