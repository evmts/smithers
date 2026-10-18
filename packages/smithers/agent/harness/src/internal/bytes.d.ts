/**
 * UTF-8 byte measurement and boundary-safe slicing.
 *
 * JavaScript indexes strings in UTF-16 code units, while every bound this
 * harness presents to a model and records in a journal is stated in UTF-8
 * bytes. These helpers keep that unit honest without ever cutting a code point
 * into an invalid string.
 *
 * @since 0.1.0
 * @private
 */
/**
 * Measures a string in UTF-8 bytes.
 *
 * @category conversions
 * @since 0.1.0
 * @private
 */
export declare const size: (text: string) => number;
/**
 * Returns the longest code-point-aligned prefix no wider than `limit` UTF-8 bytes.
 *
 * @category conversions
 * @since 0.1.0
 * @private
 */
export declare const headSlice: (text: string, limit: number) => string;
/**
 * Returns the longest code-point-aligned suffix no wider than `limit` UTF-8 bytes.
 *
 * @category conversions
 * @since 0.1.0
 * @private
 */
export declare const tailSlice: (text: string, limit: number) => string;
