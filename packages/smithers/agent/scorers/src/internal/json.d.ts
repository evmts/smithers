/**
 * Detects values that JSON serialization silently loses.
 *
 * A scorer's declared configuration is hashed into its durable `scorerKey`
 * through canonical JSON, and canonical JSON mirrors `JSON.stringify`: a
 * function, a symbol, an explicit `undefined` member, or a symbol-keyed
 * property disappears before the hash is taken. Two scorers whose declarations
 * differ only in such a member would then share one durable identity forever,
 * so the declaration is rejected instead of quietly collapsing.
 *
 * Canonical JSON also calls a `toJSON` member and hashes its replacement value.
 * Refusing that member is the only decidable answer: anything the replacement
 * loses is absent from the identity, while calling `toJSON` here to inspect it
 * would execute caller code twice with no promise that both calls agree.
 *
 * @since 0.1.0
 */
/**
 * Names the first member of `value` that canonical JSON would drop or reject.
 *
 * Returns `undefined` when the value round-trips losslessly. The returned
 * string is a path plus the reason, never the offending value itself, so a
 * declaration failure cannot leak a configuration into an error message.
 *
 * @category predicates
 * @since 0.1.0
 */
export declare const lossyPath: (value: unknown, root: string) => string | undefined;
