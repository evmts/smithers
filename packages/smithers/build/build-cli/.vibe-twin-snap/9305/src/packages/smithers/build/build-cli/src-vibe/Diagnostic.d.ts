/**
 * Side-effect-free rendering of values that cross a failure boundary.
 *
 * A rejected promise may carry any JavaScript value. Calling `String` on an
 * object, reading an accessor-backed `message`, or inspecting a Proxy can run
 * arbitrary user code while the original failure is being reported. These
 * helpers accept only primitives and own data properties, bound the resulting
 * text, and otherwise use a caller-owned fallback.
 *
 * @since 0.1.0
 */
/**
 * Maximum UTF-16 code units admitted into one rendered failure.
 *
 * @category constants
 * @since 0.1.0
 * @slop
 */
export declare const maximumMessageCodeUnits: number;
/**
 * Renders a rejected value without invoking object-owned behavior.
 *
 * @category rendering
 * @since 0.1.0
 * @slop
 */
export declare const message: (cause: unknown, fallback?: string) => string;
/**
 * Renders a rejected value, reading an accessor-backed `message` when a native
 * Error carries none as an own data property.
 *
 * {@link message} never runs code the rejected value owns, which is the right
 * posture at a boundary that hands back an arbitrary value. It also renders
 * nothing for the errors Effect raises: `SchemaError` and the `Data.TaggedError`
 * family define `message` as a prototype accessor, so a failure carrying a full
 * decode diagnostic rendered as the caller's fallback and the reason was lost.
 *
 * A target failure is produced by code this CLI already evaluates and runs, so
 * this renderer invokes that accessor. It admits only a string, bounds the
 * result exactly as {@link message} does, refuses a Proxy, and answers with the
 * fallback if the accessor throws.
 *
 * @category rendering
 * @since 0.1.0
 * @slop
 */
export declare const describe: (cause: unknown, fallback?: string) => string;
/**
 * The one sentence an operator sees for a failure build-cli did not design.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const unknownFailure = "Something went wrong on our side. Not your fault.";
/**
 * Renders a failure for the CLI operator: a designed sentence as written,
 * anything else as {@link unknownFailure}. `verbose` appends the raw message,
 * never a stack.
 *
 * @category rendering
 * @since 1.0.0
 */
export declare const present: (cause: unknown, options: {
    readonly verbose: boolean;
}) => string;
/**
 * Converts an arbitrary rejection into an Error whose message is safe to read.
 * Standard Errors with a bounded own data message retain their original stack.
 *
 * @category constructors
 * @since 0.1.0
 * @slop
 */
export declare const error: (cause: unknown, fallback?: string) => Error;
