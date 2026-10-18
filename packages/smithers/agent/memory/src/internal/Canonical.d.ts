/**
 * Deterministic text ordering and JSON canonicalization.
 *
 * @since 0.1.0
 */
/**
 * Compares text in ascending code-unit order.
 *
 * @category ordering
 * @since 0.1.0
 */
export declare const compareText: (left: string, right: string) => number;
/**
 * Encodes a detached JSON value with recursively sorted object keys.
 *
 * @category encoding
 * @since 0.1.0
 */
export declare const canonicalJson: (value: unknown) => string;
