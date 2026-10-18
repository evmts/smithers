/** Native store existence without mistaking a PostgreSQL schema for a local file.
 * @since 1.0.0
 */
/** Whether the native database adapter opens `filename` as a PostgreSQL schema.
 * @category predicates
 * @since 1.0.0
 */
export declare const postgres: (filename: string) => boolean;
/** Configuration follows the native database adapter's explicit-URL precedence.
 * @category predicates
 * @since 1.0.0
 */
export declare const exists: (filename: string) => boolean;
