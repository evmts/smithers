/**
 * Deterministic JSON encoding for model-step inputs.
 *
 * @since 0.1.0
 */
/**
 * Serializes a JSON value with recursively sorted object keys. Array order is
 * retained. Non-JSON values are rejected instead of being silently coerced or
 * omitted by `JSON.stringify`.
 *
 * This is deliberately stricter than `@smthrs/canonical`, which mirrors
 * `JSON.stringify` exactly. A model request body is sealed-step key material:
 * a value `JSON.stringify` would drop (`undefined`, a function) or reshape
 * (`toJSON`, a `Date`, a `Map`) means the key and the wire body describe
 * different requests, so it is rejected here rather than encoded. Everything
 * both encoders accept they encode identically, including an own member named
 * `__proto__`.
 *
 * @category encoding
 * @since 0.1.0
 * @slop
 */
export declare const stringify: (value: unknown) => string;
/**
 * Encodes the canonical JSON representation as UTF-8 bytes.
 *
 * @category encoding
 * @since 0.1.0
 * @slop
 */
export declare const bytes: (value: unknown) => Uint8Array;
/**
 * Computes pi's dependency-free, deterministic two-lane short hash. This is
 * copied from pi's historical `packages/ai/src/utils/hash.ts` so synthetic
 * OpenAI tool-search call ids remain stable across transcript replay.
 *
 * @category hashing
 * @since 0.1.0
 * @slop
 */
export declare const shortHash: (input: string) => string;
