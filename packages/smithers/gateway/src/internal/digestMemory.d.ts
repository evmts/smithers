/** Encoded retained-data accounting for private diagnosis state.
 * @since 1.0.0
 */
/** Measures retained JSON-shaped data without keeping another copy.
 * @category utilities
 * @since 1.0.0
 */
export declare const encodedBytes: (value: unknown) => number;
/** Associates a digest with its compact identity ledger's byte budget.
 * @category utilities
 * @since 1.0.0
 */
export declare const recordDigestBytes: (digest: object, bytes: number) => void;
/** Includes private scalar contributions in the projection retention budget.
 * @category utilities
 * @since 1.0.0
 */
export declare const retainedDigestBytes: (digest: object | undefined) => number;
