/**
 * Stable failures reported at the harness translation boundary.
 *
 * @since 0.1.0
 */
import * as Evaluator from "@smthrs/model/Evaluator";
import { Schema } from "effect";
/**
 * Stable harness failure codes.
 *
 * The set is closed to codes this package and `@smthrs/agent` actually raise;
 * `test/Contracts.test.ts` pins every member to a construction site under
 * `src`. Interrupting a run does not raise one: `CellTurn` emits
 * `AgentEvent.Aborted` and forwards the interrupt cause unchanged, and a
 * failed projection is `Transcript.TranscriptError`. A foreign CLI adapter declares its own error family beside the adapter in
 * `@smthrs/agent` rather than borrowing this one.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export declare const HarnessErrorCode: Schema.Literals<readonly ["assembly_failed", "approval_unavailable", "incompatible_journal", "render_failed", "model_failed", "engine_failed", "read_only_cap", "completion_unjudged", "completion_incomplete", "claim_unproven", "suspended"]>;
/**
 * Stable harness failure codes.
 *
 * @category models
 * @since 0.1.0
 * @slop
 */
export type HarnessErrorCode = typeof HarnessErrorCode.Type;
declare const HarnessError_base: Schema.Class<HarnessError, Schema.TaggedStruct<"/harness/HarnessError", {
    readonly code: Schema.Literals<readonly ["assembly_failed", "approval_unavailable", "incompatible_journal", "render_failed", "model_failed", "engine_failed", "read_only_cap", "completion_unjudged", "completion_incomplete", "claim_unproven", "suspended"]>;
    readonly message: Schema.String;
    readonly cause: Schema.optional<Schema.Union<readonly [typeof Evaluator.EvaluatorError, Schema.Defect]>>;
}>, import("effect/Cause").YieldableError>;
/**
 * A failure while translating a recorded agent turn.
 *
 * Evaluator causes retain their typed fields across replay. Other causes use
 * {@link Schema.Defect} rather than {@link Schema.Unknown}: a
 * `HarnessError` is a member of `@smthrs/agent/AgentAction`'s `AgentFailure`
 * union, which is encoded through the durable exit schema for journaling. A
 * raw `Error` (or any other non-JSON value) attached as `cause` has no safe
 * JSON representation under `Schema.Unknown`, so encoding it dies with a
 * `SchemaError` that replaces the real failure instead of reporting it.
 * `Schema.Defect` decodes to the same `unknown` type but encodes any value —
 * including a real `Error` — to JSON, with the same graceful degradation
 * `Cause` defects already rely on elsewhere in this codebase.
 *
 * @category errors
 * @since 0.1.0
 * @slop
 */
export declare class HarnessError extends HarnessError_base {
}
export {};
