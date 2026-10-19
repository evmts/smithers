import { type StoredKey } from "@smthrs/keys";
import { Crypto, Effect } from "effect";
/** Hashes test fixtures with the concrete Node crypto layer. */
export declare const sha256: (input: string | Uint8Array) => string;
/** Provides concrete Node cryptography to a test Effect. */
export declare const withCrypto: <A, E>(effect: Effect.Effect<A, E, Crypto.Crypto>) => Effect.Effect<A, E>;
/** Runs a synchronous test Effect with concrete Node cryptography. */
export declare const runSync: <A, E>(effect: Effect.Effect<A, E, Crypto.Crypto>) => A;
/** Runs an asynchronous test Effect with concrete Node cryptography. */
export declare const runPromise: <A, E>(effect: Effect.Effect<A, E, Crypto.Crypto>) => Promise<A>;
/** Derives a canonical key with concrete test cryptography. */
export declare const key: (input: unknown) => StoredKey;
/** Mirrors the engine's private invocation-key encoding. */
export declare const invocationKey: (input: unknown) => StoredKey;
