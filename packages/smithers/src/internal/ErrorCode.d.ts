/**
 * The Node system error code carried by a thrown value.
 * @since 1.0.0
 */
/**
 * Reads `code` from a thrown value, such as `ENOENT` from a failed `fs` call.
 * Anything without a string `code` yields `undefined`.
 * @category conversions
 * @since 1.0.0
 */
export declare const errorCode: (error: unknown) => string | undefined;
