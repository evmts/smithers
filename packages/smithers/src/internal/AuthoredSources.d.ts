/**
 * Which discovered flows a native execution actually wrote the entry file of.
 *
 * The engine journals copy-back in two halves, and only the pair is evidence.
 * `flows.engine.diff-bundle-captured` says what an isolated attempt PROPOSED
 * to change; `flows.engine.copy-back-settled` says that proposal reached the
 * host. A capture on its own is speculative — the attempt may still fail, its
 * bundle may lose every rebase — so acting on one would refresh a catalog from
 * source bytes no run ever applied.
 *
 * The two are matched on the identity both carry: the execution and generation
 * the projection read them under, plus the attempt's own `runId`,
 * `stepKeyDigest`, `attempt` and `bundleIdentity`. That is the same rule the
 * app applies to the projected control rows
 * (`apps/app/src/mainview/state/FlowAuthoringReceipts.ts`); this one runs on
 * the host, over the engine's own entries, because the host has to act before
 * any client reads them.
 *
 * @since 1.0.0
 * @private
 */
/**
 * One native record, as the projection reads it off the engine journal.
 *
 * @since 1.0.0
 * @private
 */
export interface Entry {
    readonly runId: string;
    readonly eventType: string;
    readonly payload: unknown;
}
/**
 * The matcher's state: one open capture per attempt, until its copy-back
 * settles or the projection is done with the run.
 *
 * @since 1.0.0
 * @private
 */
export interface Matcher {
    /** The flow ids this record applied the entry file of. Empty for everything else. */
    readonly observe: (entry: Entry, generation: number) => ReadonlyArray<string>;
}
/**
 * Matches settled copy-backs to their captured bundles.
 *
 * One matcher per observed execution: the projection follows a run and its
 * descendants, and a bundle captured under one attempt can only settle under
 * the same one.
 *
 * @since 1.0.0
 * @private
 */
export declare const make: () => Matcher;
