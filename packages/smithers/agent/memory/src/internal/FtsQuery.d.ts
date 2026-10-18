/**
 * Escaping of user text into literal FTS5 queries.
 *
 * @since 0.1.0
 */
/**
 * Splits user text into its well-formed, whitespace-separated query terms.
 *
 * @category queries
 * @since 1.0.0
 */
export declare const ftsTerms: (query: string) => ReadonlyArray<string>;
/**
 * Escapes user text into quoted FTS5 terms with implicit AND semantics.
 *
 * @category queries
 * @since 0.1.0
 */
export declare const literalFtsQuery: (query: string) => string;
