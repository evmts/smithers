/**
 * Projections of a model-written memory value into indexed text and tags.
 *
 * @since 0.1.0
 */
/**
 * Selects the text indexed for an authoritative memory value.
 *
 * @category projections
 * @since 0.1.0
 */
export declare const searchableText: (value: unknown) => string;
/**
 * Retains string tags from a model-written memory value.
 *
 * @category projections
 * @since 0.1.0
 */
export declare const retainedTags: (value: unknown) => ReadonlyArray<string>;
