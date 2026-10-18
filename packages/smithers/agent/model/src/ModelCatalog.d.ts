/**
 * Static facts about known provider models.
 *
 * A model id is the only thing a caller has before it reaches a provider, and
 * some decisions have to be made from it alone. This module is where those
 * facts live, beside the protocols that produce the ids, so a consumer that is
 * deliberately provider-neutral never has to carry a provider table of its own.
 *
 * @since 1.0.0-rc.0
 */
/**
 * The context window, in tokens, of a model id this catalog has met, or
 * `undefined` when no row matches. A display that must not invent a window
 * (a usage meter) reads this; a budget that needs a number reads
 * `contextWindowTokensFor`.
 *
 * @category resolvers
 * @since 1.0.0-rc.1
 */
export declare const knownContextWindowTokens: (modelId: string) => number | undefined;
/**
 * The context window, in tokens, of a known model id, with a conservative
 * floor for models the catalog has not met. Never zero: a consumer that reads
 * zero as "compaction disabled" must not have it disabled by a resolver that
 * did resolve a window.
 *
 * @category resolvers
 * @since 1.0.0-rc.0
 */
export declare const contextWindowTokensFor: (modelId: string) => number;
/**
 * The largest output budget, in tokens, a known model accepts, or `undefined`
 * for a model the catalog has not met. A protocol that must state a budget
 * (Anthropic Messages) sends this instead of a guess, so a turn is not cut off
 * below what the model can write.
 *
 * @category resolvers
 * @since 1.0.0-rc.1
 */
export declare const maxOutputTokensFor: (modelId: string) => number | undefined;
