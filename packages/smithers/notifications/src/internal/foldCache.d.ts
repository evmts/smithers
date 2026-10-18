/**
 * Bounded, scan-resistant retention for the per-run folds a journal reader
 * keeps in memory.
 *
 * @private
 * @since 1.0.0
 */
/**
 * A bounded per-run fold cache.
 *
 * @private
 * @since 1.0.0
 */
export interface FoldCache<A> {
    readonly get: (key: string) => A | undefined;
    readonly put: (key: string, value: A) => void;
}
/**
 * A bounded map of per-run folds that a sweep wider than the bound cannot
 * empty.
 *
 * Least-recently-used eviction has a zero hit rate under exactly the workload
 * a supervisor produces: an ordered sweep of `bound + 1` runs evicts the fold
 * the next read is about to want, so every poll replays every journal from
 * sequence zero instead of reading its tail. Under pressure this instead
 * sacrifices the NEWEST fold no later read has reused, so a sweep of any width
 * keeps every fold it has read twice and pays for its width in a fixed handful
 * of refolds. Only when every retained fold has been reused does it fall back
 * to evicting the oldest, and it then clears the reuse marks so a fold cannot
 * hold a slot on one ancient read forever.
 *
 * @private
 * @since 1.0.0
 */
export declare const make: <A>(bound: number) => FoldCache<A>;
