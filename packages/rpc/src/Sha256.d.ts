/**
 * SHA-256 with nothing behind it: no Effect, no Node built-in, no injected host.
 *
 * `@smthrs/rpc` is decoded by the browser, by the Cloudflare Worker and by the
 * native host, so `test/NativeAgent.test.ts` holds every module here to the
 * runtime-free entry points of the Smithers boundary. `@smthrs/crypto/Sha256`
 * is the package that owns hashing for Smithers, but reaching it from a
 * contract module pulls `effect/Crypto`, `effect/Schema` and their transitive
 * runtime into all three bundles for the sake of one synchronous digest.
 *
 * This is the same FIPS 180-4 function over the same UTF-8 encoding, so a
 * digest computed here equals the one `@smthrs/crypto` computes for the same
 * text; `test/Sha256.test.ts` pins that against `node:crypto`. Use this only
 * for the content identities these contracts carry, and use `@smthrs/crypto`
 * anywhere an Effect runtime is already present.
 *
 * @since 1.0.0
 */
/**
 * The SHA-256 of well-formed UTF-8 text, as 64 lowercase hexadecimal characters.
 *
 * Throws a `TypeError` when the text carries an unpaired UTF-16 surrogate,
 * which UTF-8 cannot represent.
 *
 * @since 1.0.0
 * @category conversions
 */
export declare const digestSync: (text: string) => string;
