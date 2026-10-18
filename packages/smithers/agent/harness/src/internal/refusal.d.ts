/**
 * The one constructor for a refusal a cell observes as a resolved envelope.
 *
 * A failed call **resolves** with a `failure` `Cell.CallResult`; it does not
 * throw, and `Cell.callFailure` renders it as `{ ok: false, error }`. The shape
 * is fixed — `value` is `null`, because a refusal has no value to hand back,
 * except a timeout's, which records the limit it ran past (see {@link timedOut})
 * — so every boundary that refuses a call builds it here rather than repeating
 * the literal. The cell never sees `value` on a failure. An absent `code` is left absent rather than written as
 * `undefined`: the encoded result is the durable wire contract used in sealed
 * keys, and it means {@link Cell.defaultCallFailureCode}.
 *
 * @since 1.0.0-rc.0
 * @private
 */
import { type CallFailureCode, CallResult } from "../Cell.ts";
/**
 * A refusal the cell observes as a resolved `{ ok: false, error }` envelope.
 *
 * @since 1.0.0-rc.0
 * @private
 */
export declare const refusal: (code: CallFailureCode | undefined, message: string) => CallResult;
/**
 * A timeout refusal: the `timeout` code, with the limit the call ran past
 * recorded as `{ limitMillis }` in `value`, so a host that guards timeouts
 * parks the run on the exact limit whichever clock enforced it.
 *
 * @since 1.0.0-rc.1
 * @private
 */
export declare const timedOut: (message: string, limitMillis: number) => CallResult;
/**
 * The limit a {@link timedOut} refusal recorded, when it recorded one.
 *
 * @since 1.0.0-rc.1
 * @private
 */
export declare const limitOf: (result: CallResult) => number | undefined;
