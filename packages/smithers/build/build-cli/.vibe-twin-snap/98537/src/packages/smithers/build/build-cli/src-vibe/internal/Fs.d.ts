/**
 * Filesystem-boundary helpers shared by the modules that read untrusted paths
 * and report what went wrong when one cannot be read.
 *
 * `Cache.ts` and `Workspace.ts` each carried byte-identical copies of
 * {@link optionalOpenFlag} and near-identical copies of {@link errorCode} and
 * {@link failureMessage}. They are one policy — how this package inspects a
 * rejected value without running code that value owns — so they live in one
 * place.
 *
 * @since 0.1.0
 */
/**
 * Returns an open(2) flag the platform may not provide.
 *
 * Windows builds of libuv define neither `O_NOFOLLOW` nor `O_NONBLOCK`; a
 * missing flag contributes nothing rather than crashing the open.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const optionalOpenFlag: (name: "O_NOFOLLOW" | "O_NONBLOCK") => number;
/**
 * Reads a rejected value's own `code` data property, or undefined.
 *
 * Only an own data property is read: an accessor or a Proxy trap would run
 * arbitrary code while a failure is being classified.
 *
 * @category rendering
 * @since 0.1.0
 */
export declare const errorCode: (cause: unknown) => string | undefined;
/**
 * Reads a rejected value's own `message` data property, or the generic text.
 *
 * Same posture as {@link errorCode}: own data properties only.
 *
 * @category rendering
 * @since 0.1.0
 */
export declare const failureMessage: (cause: unknown) => string;
