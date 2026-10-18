/**
 * Pure pending-notification queue state.
 *
 * @since 0.1.0
 */
import type { Notification } from "./Notification.ts";
import type * as NotificationEvent from "./NotificationEvent.ts";
/**
 * The default maximum number of pending notifications retained per run.
 *
 * The bound is what makes an undrained run a known quantity instead of a
 * function of how long it was ignored. Admitting past it decides
 * `rejected-full`, which retains nothing and writes no journal entry, so the
 * notification is admissible again once a boundary drains.
 * `NotificationQueue.layerWith` raises or lowers it for one composition.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const defaultCapacity = 128;
/**
 * A notification retained until it is promoted at a harness safe point.
 *
 * `seq` is the journal sequence the admission committed at, which is what a
 * turn-close cutoff compares against.
 *
 * @category models
 * @since 0.1.0
 */
export interface Pending {
    readonly notification: Notification;
    readonly seq: number;
}
/**
 * The result recorded for one durable notification admission.
 *
 * Re-exported from `NotificationEvent`, which owns the single declaration, so
 * the type these signatures use and the schema the journal validates against
 * can never drift apart.
 *
 * @category models
 * @since 0.1.0
 */
export type AdmissionDecision = NotificationEvent.AdmissionDecision;
/**
 * Immutable bounded queue state derived from the notification journal.
 *
 * The value is immutable in its own structure: the state and the `Pending`
 * wrappers it holds are frozen, and every transition returns a new state
 * rather than editing this one. The notifications inside are not re-frozen
 * here, because `NotificationQueue.admit` already snapshots a notification at
 * the durability boundary, so no state built by the queue shares mutable
 * structure with a caller.
 *
 * @category models
 * @since 0.1.0
 */
export interface State {
    readonly capacity: number;
    readonly items: ReadonlyArray<Pending>;
}
/**
 * One pure admission transition and its visible decision.
 *
 * @category models
 * @since 0.1.0
 */
export interface Admission {
    readonly state: State;
    readonly decision: AdmissionDecision;
}
/**
 * A pure promotion transition: what a boundary takes, and what is left.
 *
 * @category models
 * @since 0.1.0
 */
export interface Promotion {
    readonly state: State;
    readonly promoted: ReadonlyArray<Pending>;
}
/**
 * Creates an empty bounded notification queue.
 *
 * A capacity that is not a finite number becomes zero, so a misconfigured
 * bound refuses everything loudly rather than retaining an unbounded backlog.
 *
 * @param capacity the maximum number of pending notifications
 * @category constructors
 * @since 0.1.0
 */
export declare const empty: (capacity: number) => State;
/**
 * Admits a notification, coalescing only pending system events that share both
 * a key and a target lineage. Coalescing retains the first sequence so replay
 * order remains stable.
 *
 * A queue already at capacity decides `rejected-full` and retains nothing. The
 * caller owns what happens next: `NotificationQueue.admit` writes no journal
 * entry for that decision, so the same notification is admissible again once a
 * boundary drains.
 *
 * @param state the current queue state
 * @param notification the notification to admit
 * @param seq the journal sequence the admission is recorded at
 * @category operations
 * @since 0.1.0
 */
export declare const admit: (state: State, notification: Notification, seq: number) => Admission;
/**
 * Applies the decision already committed in an admission journal event.
 *
 * Replay never re-decides: the committed decision is the one that happened,
 * whatever this process's state would have chosen. The `rejected-full` branch
 * stays reachable for a record written by any other writer, even though this
 * package never writes one.
 *
 * @param state the state so far
 * @param notification the notification the record admitted
 * @param seq the journal sequence the record committed at
 * @param decision the decision the record carries
 * @category operations
 * @since 0.1.0
 */
export declare const applyAdmission: (state: State, notification: Notification, seq: number, decision: AdmissionDecision) => State;
/**
 * Returns still-pending notifications in their durable journal order.
 *
 * @param state the current queue state
 * @param admission which admission class to report
 * @param targetLineageId the lineage to report for, or every lineage when absent
 * @category getters
 * @since 0.1.0
 */
export declare const pending: (state: State, admission: "steer" | "queue", targetLineageId?: string) => ReadonlyArray<Pending>;
/**
 * Promotes every steer notification admitted at or before the turn-close
 * cutoff. Notifications admitted after the cutoff remain pending.
 *
 * The cutoff is what holds a steer that arrived mid-turn until the next
 * boundary, and `NotificationQueue.DrainInput.cutoffSeq` is how a caller sets
 * it. A drain that names no cutoff delivers everything pending for the lineage.
 *
 * @param state the current queue state
 * @param cutoffSeq the highest admission sequence this boundary may deliver
 * @param targetLineageId the lineage the boundary belongs to, or every lineage when absent
 * @category operations
 * @since 0.1.0
 */
export declare const promoteSteers: (state: State, cutoffSeq: number, targetLineageId?: string) => Promotion;
/**
 * Promotes exactly the oldest pending queue notification.
 *
 * @param state the current queue state
 * @param targetLineageId the lineage the boundary belongs to, or every lineage when absent
 * @category operations
 * @since 0.1.0
 */
export declare const promoteQueued: (state: State, targetLineageId?: string) => Promotion;
/**
 * Applies a durable promotion record while replaying journal history.
 *
 * @param state the state so far
 * @param ids the notification ids the record promoted
 * @category operations
 * @since 0.1.0
 */
export declare const applyPromoted: (state: State, ids: ReadonlyArray<string>) => State;
