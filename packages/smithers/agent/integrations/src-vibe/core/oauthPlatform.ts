/**
 * E-7/EK4402: `Buffer` is a platform API, which VibeLang code does not call
 * directly. `OAuthToken.vibe` encodes the RFC 6749 §2.3.1 Basic credential
 * through this, the source's own expression.
 */

/** @vibelang trusted */
export const base64 = (text: string): string => Buffer.from(text).toString("base64")
