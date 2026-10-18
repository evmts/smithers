/**
 * Journal-backed durable notification admission and turn-boundary drain.
 *
 * Governing contract: `packages/smithers/notifications/docs/api.md`, published as
 * `/api/notifications`.
 *
 * @since 0.1.0
 */
import { Journal } from "@smthrs/journal";
import { Context, Effect, Layer, Schema } from "effect";
import * as NotificationModel from "./Notification.ts";
import * as NotificationState from "./NotificationState.ts";
declare const NotificationError_base: Schema.Class<NotificationError, Schema.TaggedStruct<"/notifications/NotificationError", {
    readonly code: Schema.withConstructorDefault<Schema.Literals<readonly ["notification_unavailable", "notification_closed", "notification_full", "notification_id_reused", "notification_invalid", "notification_refused"]>>;
    readonly message: Schema.String;
    /** The notification the failure is about, when one was readable. */
    readonly notificationId: Schema.optional<Schema.String>;
    /** Dotted path of the offending field, for `notification_invalid`. */
    readonly path: Schema.optional<Schema.String>;
}>, import("effect/Cause").YieldableError>;
/**
 * The queue could not be reached, or it refused what a caller handed it.
 *
 * `code` is the stable half and the one to branch on. `notification_unavailable`
 * is the seam reporting that it serves nothing; `notification_id_reused` says a
 * stable id was admitted once already with different content, which is a
 * producer bug rather than a storage failure; `notification_invalid` says the
 * value is not a notification, and `path` names the field inside it that failed.
 * `notification_closed` means the receiver has finished and the caller must
 * start a new request; `notification_full` means nothing was retained and the
 * same notification may be retried after pending work drains. Neither the
 * message nor `path` ever carries the offending value.
 * `notification_refused` rejects reserved outside-change payloads before admission.
 *
 * @category errors
 * @since 0.1.0
 */
export declare class NotificationError extends NotificationError_base {
}
/**
 * What admitting one notification decided.
 *
 * `seq` is the journal sequence the admission committed at, and it is absent
 * exactly when nothing was written, which today means a `rejected-full`
 * refusal. `duplicate` says the id was already admitted, in which case
 * `decision` and `seq` are read back from the committed record rather than
 * recomputed here.
 *
 * A caller MUST inspect `decision`: `rejected-full` means the queue was at
 * capacity and retained nothing, so the notification never reaches the model
 * unless the caller admits it again once a boundary has drained.
 *
 * @category models
 * @since 0.1.0
 */
export interface AdmissionReceipt {
    readonly notificationId: string;
    readonly decision: NotificationState.AdmissionDecision;
    readonly seq: number | undefined;
    readonly duplicate: boolean;
    readonly consumed?: boolean;
    readonly consumedNotification?: NotificationModel.Notification;
}
/**
 * The boundary a drain is attempted at, and whether the run would go idle
 * if nothing were delivered.
 *
 * `(runId, targetLineageId, boundary)` is the unit of drain: two lineages
 * closing a turn under the same boundary name are two drains, and each is
 * recorded separately.
 *
 * @category models
 * @since 0.1.0
 */
export interface DrainInput {
    readonly runId: string;
    readonly targetLineageId: string;
    readonly boundary: string;
    readonly wouldIdle: boolean;
    /**
     * The journal sequence that opened this turn. A steer admitted after it is
     * held for the next boundary, which is what keeps a message that arrived
     * mid-turn out of the turn already in flight. Omitting it delivers
     * everything pending for the lineage. A value that is not a non-negative
     * integer fails the drain with `notification_invalid` and records nothing.
     */
    readonly cutoffSeq?: number | undefined;
}
/**
 * The notifications this boundary delivers, and whether the boundary had
 * already drained.
 *
 * The notifications are the ones the committed promotion record names, so two
 * processes draining one boundary report the same delivery rather than two
 * divergent guesses.
 *
 * @category models
 * @since 0.1.0
 */
export interface DrainReceipt {
    readonly notifications: ReadonlyArray<NotificationModel.Notification>;
    readonly boundary: string;
    readonly duplicate: boolean;
}
/**
 * The durable pending queue: admit a notification exactly once, and drain
 * what a boundary is allowed to deliver.
 *
 * @category services
 * @since 0.1.0
 */
export interface Service {
    readonly admit: (runId: string, notification: NotificationModel.Notification, version?: number) => Effect.Effect<AdmissionReceipt, Journal.JournalError | NotificationError>;
    readonly drain: (input: DrainInput) => Effect.Effect<DrainReceipt, Journal.JournalError | NotificationError>;
    /**
     * What this run has been told that no boundary has delivered yet, in
     * admission order.
     *
     * The queue is the owner of that fact: pending is admitted minus promoted,
     * and both halves are its own journal records. A supervisor that counted
     * admissions alone would report a steer as waiting forever.
     */
    readonly pending: (runId: string) => Effect.Effect<ReadonlyArray<NotificationModel.Notification>, Journal.JournalError | NotificationError>;
}
declare const NotificationQueue_base: Context.ServiceClass<NotificationQueue, "/notifications/NotificationQueue", Service>;
/**
 * The {@link Service} tag.
 *
 * @category services
 * @since 0.1.0
 */
export declare class NotificationQueue extends NotificationQueue_base {
}
/**
 * Builds a {@link Service} from an implementation of its methods.
 *
 * @param implementation the methods to serve
 * @category constructors
 * @since 0.1.0
 */
export declare const make: (implementation: Service) => Service;
/**
 * A {@link Service} that fails every method as unavailable. Overrides
 * replace individual methods.
 *
 * @param overrides methods to serve instead of failing
 * @category constructors
 * @since 0.1.0
 */
export declare const makeNoop: (overrides?: Partial<Service>) => Service;
/**
 * Provides {@link makeNoop}.
 *
 * @param overrides methods to serve instead of failing
 * @category layers
 * @since 0.1.0
 */
export declare const layerNoop: (overrides?: Partial<Service>) => Layer.Layer<NotificationQueue>;
/**
 * Journal-backed production layer, with the pending capacity a composition
 * chooses.
 *
 * Admission and drain evidence is written through `emitDurableUnfenced`, so
 * both return only after the corresponding entry is durably committed and a
 * dropped lifecycle event is unrepresentable. The channel is the unfenced one
 * on purpose: the notifying process owns no run, so there is no ownership
 * fence to hand over, and both records are first-writer-wins on their own
 * identity instead.
 *
 * The capacity guard is a conditional write at the storage layer, not a check
 * against a fold one process happened to load: the fold, the guard, and the
 * admission record are decided and written inside ONE `journal.transact`
 * write transaction, which the durable writer serializes against every other
 * writer of the database and replays when a concurrent writer commits between
 * the guard's reads and the insert. Two processes admitting to one full queue
 * therefore produce one admission and one `rejected-full`, never two
 * admissions.
 *
 * @param options the pending capacity, defaulting to `NotificationState.defaultCapacity`
 * @category layers
 * @since 1.0.0
 */
export declare const layerWith: (options?: {
    readonly capacity?: number | undefined;
}) => Layer.Layer<NotificationQueue, never, Journal.Journal>;
/**
 * Journal-backed production layer at the default capacity.
 *
 * @category layers
 * @since 0.1.0
 */
export declare const layer: Layer.Layer<NotificationQueue, never, Journal.Journal>;
export {};
