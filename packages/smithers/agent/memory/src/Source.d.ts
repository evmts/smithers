/**
 * Advisory memory context source for an agent's opening context.
 *
 * {@link readRows} fetches primer notes and recall once, bounded to the fenced
 * byte budget, and returns the rows unrendered; {@link render} fences them.
 * A read that fails or passes its two-second timeout fails with the typed
 * cause: there is no empty-text stand-in, so the host decides what a run
 * without its memory does. Values returned by {@link declared} are accepted
 * as `Agent.Options.memory`, which renders them into the opening context and
 * lets a judged run's relevance reading withhold rows.
 *
 * The fence is a delimiter, not a trust boundary. Rows are model-written, so
 * fence tokens, attribution prefixes, and line terminators inside a row are
 * rendered as visible `\uXXXX` escapes: one row is always one line, and only
 * {@link render} writes a fence or a `[primer:bank]` / `[bank/key]` label.
 *
 * ## What "once per `(lineageId, iteration)`" actually promises
 *
 * Every source has an in-process memo. With no
 * {@link SnapshotRecorder.SnapshotRecorder} in the Effect context, that is the
 * whole guarantee: two reads through one source return the same successful
 * rows, a failed read is retried, and a second source refetches live memory.
 * This is the documented default for compositions that use `@smthrs/memory`
 * alone.
 *
 * When a recorder is present, the first read for an identity goes through its
 * boundary. A failed read is not recorded and can be retried. A second
 * source, including one built by a resumed process, receives the recorded
 * rows instead of refetching memory. The production adapter is
 * `@smthrs/agent/MemorySnapshotRecorder.layer`; it implements this package's
 * port through `@smthrs/harness` `EngineLike.record`. The dependency therefore
 * points from agent to memory and harness, while memory imports neither.
 *
 * The consequence is worth stating plainly, because it is the reason to record
 * this value rather than re-derive it. Memory text goes into an agent's OPENING
 * context, so a resumed run whose snapshot came back different has a different
 * frame-zero prefix. That re-keys every sealed model step under it, causing the
 * run to re-execute model calls it already paid for. Composing the agent adapter
 * closes that replay gap; omitting it deliberately keeps the process-local
 * fallback.
 *
 * @see https://memory.smithers.sh/reference/api/
 *
 * @since 0.1.0
 */
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import type { MemoryError } from "./MemoryError.ts";
import * as MemoryStore from "./MemoryStore.ts";
import * as Recall from "./Recall.ts";
import * as SnapshotRecorder from "./SnapshotRecorder.ts";
/**
 * Source input and retry identity.
 *
 * `lineageId` and `iteration` alone select the frozen snapshot. Banks, query,
 * tag groups, primer banks, and both budgets are honored only by the first
 * read for that identity; later differences are warned and ignored.
 * `maxTokens` caps recalled rows in conservative UTF-8 bytes, while
 * `maxBytes` caps the complete fenced snapshot {@link render} writes.
 *
 * @category models
 * @since 0.1.0
 */
export interface Input extends Recall.Input {
    readonly lineageId: string;
    readonly iteration: number;
    readonly primerBanks?: ReadonlyArray<string>;
    readonly maxBytes?: number;
}
/**
 * A memory source value consumed by the host that builds an agent's opening
 * context.
 *
 * @category models
 * @since 0.1.0
 */
export interface Source {
    readonly read: (input: Input) => Effect.Effect<SnapshotRecorder.Snapshot, MemoryError | Cause.TimeoutError, MemoryStore.MemoryStore | Recall.Recall>;
}
/**
 * Exact shape `Agent.Options.memory` accepts: a snapshot's rows and the
 * digest of their whole {@link render}.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface Declared extends SnapshotRecorder.Snapshot {
    readonly digest: string;
}
/**
 * Fences rows as the opening memory block, one escaped line each; `""` for
 * no rows. Rows from {@link readRows} already fit its byte budget, and so
 * does any subset of them.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 */
export declare const render: (rows: ReadonlyArray<SnapshotRecorder.Row>) => string;
/**
 * Reads primer notes and recall for `input`, unrendered, bounded to its
 * fenced byte budget. Fails with the store's or recall's typed error, or a
 * `TimeoutError` after two seconds.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const readRows: (input: Input) => Effect.Effect<SnapshotRecorder.Snapshot, MemoryError | Cause.TimeoutError, MemoryStore.MemoryStore | Recall.Recall>;
/**
 * Constructs a memoizing memory source.
 *
 * The closure memo is always present. When
 * {@link SnapshotRecorder.SnapshotRecorder} is absent, it is the process-local
 * default. When a recorder is composed, the memoized read first asks that
 * recorder for the durable value of the same `(lineageId, iteration)`
 * identity. A failed read is neither memoized nor recorded.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const make: (options?: {
    readonly capacity?: number | undefined;
}) => Source;
/**
 * The default source value.
 *
 * @category instances
 * @since 0.1.0
 */
export declare const source: Source;
/**
 * Rows a host already holds as the exact {@link Declared} shape
 * `Agent.Options.memory` accepts. The rows are not bounded here; a host
 * bounds what it selects before declaring it.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const ofRows: (rows: ReadonlyArray<SnapshotRecorder.Row>) => Declared;
/**
 * Reads a source snapshot as the exact {@link Declared} shape
 * `Agent.Options.memory` accepts.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const declared: (memorySource: Source, input: Input) => Effect.Effect<Declared, MemoryError | Cause.TimeoutError, MemoryStore.MemoryStore | Recall.Recall>;
/**
 * Selects whole recalled rows for a host preflight. The existing recall service
 * still enforces its public byte budget and namespace policy. The caller's
 * tokenizer (or conservative UTF-8 bound) supplies a separate context budget.
 * Choices are indexes into that frozen recall result, in model-ranked order.
 * @category constructors
 * @since 1.0.0
 */
export declare const selectRecall: <E>(input: Recall.Input, choose: (rows: Recall.Output) => Effect.Effect<ReadonlyArray<number>, E>, cost: (row: Recall.Result) => number, tokenBudget: number) => Effect.Effect<Recall.Output, MemoryError | E, Recall.Recall>;
