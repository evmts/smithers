/**
 * RFC 7636 PKCE parameters for the OAuth authorization-code flow.
 *
 * The GitHub OAuth apps both run the authorization-code flow from a
 * public client, where an intercepted authorization code is otherwise
 * redeemable by whoever caught it. PKCE binds the code to the verifier that
 * requested it: the client sends `S256(verifier)` up front and the verifier
 * itself only at redemption.
 *
 * Randomness and SHA-256 are WebCrypto's, which a browser, a Cloudflare
 * Worker, Node and Bun all provide. The digest is asynchronous there, so the
 * challenge and the pair are Effects. Arguments are still checked when the
 * function is called, and an invalid one throws.
 *
 * @since 1.0.0
 */

import { Effect } from "effect"

const UNRESERVED = /^[A-Za-z0-9\-._~]+$/
const MIN_LENGTH = 43
const MAX_LENGTH = 128
const DEFAULT_RANDOM_BYTES = 32
const MIN_RANDOM_BYTES = 32
const MAX_RANDOM_BYTES = 96

const base64UrlNoPadding = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")

const checkByteLength = (byteLength: number): void => {
  if (!Number.isInteger(byteLength)) throw new TypeError("PKCE code_verifier byteLength must be an integer")
  if (byteLength < MIN_RANDOM_BYTES || byteLength > MAX_RANDOM_BYTES) {
    throw new RangeError("PKCE code_verifier byteLength must be 32..96 bytes")
  }
}

const checkVerifier = (codeVerifier: string): void => {
  if (typeof codeVerifier !== "string") throw new TypeError("PKCE code_verifier must be a string")
  if (codeVerifier.length < MIN_LENGTH || codeVerifier.length > MAX_LENGTH) {
    throw new RangeError("PKCE code_verifier must be 43..128 characters")
  }
  if (!UNRESERVED.test(codeVerifier)) {
    throw new TypeError("PKCE code_verifier must contain only RFC 7636 unreserved characters")
  }
}

// A checked verifier is ASCII, so its UTF-8 bytes are its ASCII bytes.
const challengeOf = (codeVerifier: string): Effect.Effect<string> =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier))).pipe(
    Effect.map((digest) => base64UrlNoPadding(new Uint8Array(digest)))
  )

/**
 * A complete S256 PKCE parameter set.
 *
 * @category models
 * @since 1.0.0
 */
export interface PkcePair {
  readonly codeVerifier: string
  readonly codeChallenge: string
  readonly codeChallengeMethod: "S256"
}

/**
 * A high-entropy `code_verifier`.
 *
 * `byteLength` is the entropy drawn, not the string length: 32 bytes produce
 * the 43-character minimum and 96 bytes the 128-character maximum RFC 7636
 * allows. Anything outside 32..96 bytes would encode outside that range.
 *
 * @category constructors
 * @since 1.0.0
 */
export const createCodeVerifier = (byteLength: number = DEFAULT_RANDOM_BYTES): string => {
  checkByteLength(byteLength)
  return base64UrlNoPadding(crypto.getRandomValues(new Uint8Array(byteLength)))
}

/**
 * The S256 `code_challenge` for a verifier: base64url of its SHA-256, unpadded.
 *
 * Throws `TypeError` or `RangeError` when called with a verifier RFC 7636
 * does not allow.
 *
 * @category constructors
 * @since 1.0.0
 */
export const deriveCodeChallenge = (codeVerifier: string): Effect.Effect<string> => {
  checkVerifier(codeVerifier)
  return challengeOf(codeVerifier)
}

/**
 * A fresh verifier with its challenge, drawn each time the Effect runs.
 *
 * Throws `TypeError` or `RangeError` when called with a `byteLength` outside
 * 32..96.
 *
 * @category constructors
 * @since 1.0.0
 */
export const createPkcePair = (byteLength: number = DEFAULT_RANDOM_BYTES): Effect.Effect<PkcePair> => {
  checkByteLength(byteLength)
  return Effect.suspend(() => {
    const codeVerifier = createCodeVerifier(byteLength)
    return Effect.map(
      challengeOf(codeVerifier),
      (codeChallenge): PkcePair => ({ codeVerifier, codeChallenge, codeChallengeMethod: "S256" })
    )
  })
}
