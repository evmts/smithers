/**
 * The browser's SubtleCrypto where the page has a secure context (https or localhost), else null.
 *
 * A teammate opening the install at a plain-HTTP LAN origin has no `crypto.subtle` (spec §16.3.2, T-INS-04), so a
 * caller treats null as "cannot verify" and degrades instead of failing the page. Digests come from `digestSync`
 * (@smthrs/crypto); this is for what it lacks, such as Ed25519 verification. It is the one shipped file the
 * conformance suite (lint/conformance/SecureContext.test.ts) lets read `crypto.subtle`.
 */
export const secureSubtle = (): SubtleCrypto | null =>
  globalThis.isSecureContext === false ? null : (globalThis.crypto?.subtle ?? null)
