/** Persistent scalar indexes for carried diagnosis corrections.
 * @since 1.0.0
 */
/** An ordinal and its optional timestamps, with cached subtree extrema.
 * @category models
 * @since 1.0.0
 */
export interface Index {
    readonly ordinal: number;
    readonly start: number | undefined;
    readonly end: number | undefined;
    readonly left: Index | undefined;
    readonly right: Index | undefined;
    readonly height: number;
    readonly size: number;
    readonly first: number;
    readonly min: number | undefined;
    readonly max: number | undefined;
    readonly bytes: number;
}
/** Inserts or replaces scalar evidence without changing an earlier index.
 * @category constructors
 * @since 1.0.0
 */
export declare const set: (tree: Index | undefined, ordinal: number, start?: number, end?: number) => Index;
/** Removes one ordinal, keeping earlier index versions valid.
 * @category constructors
 * @since 1.0.0
 */
export declare const remove: (tree: Index | undefined, ordinal: number) => Index | undefined;
