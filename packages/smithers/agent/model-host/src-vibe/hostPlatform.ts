// E-7/EK4402: node:buffer and node:crypto are platform APIs, which VibeLang code does
// not call directly. `HostTools.runHostTurn` records the prompt's byte length and
// SHA-256 digest through these.
import { Buffer } from "node:buffer"
import { createHash, timingSafeEqual } from "node:crypto"
import type { FetchLike } from "@smthrs/rpc/NativeAgent"

export const promptBytes = (text: string): number => Buffer.byteLength(text)

export const promptDigest = (text: string): string => createHash("sha256").update(text).digest("hex")

// `DurableChatProducer` checks a commit receipt's hash with Web Crypto, an async
// platform call, and records the guest's runtime build from `process`.
export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export const hostRuntime = (): { readonly node: string; readonly platform: string; readonly arch: string } => ({
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch
})

// The global fetch, bound as `DurableChatProducer` defaults its transport to it.
export const defaultFetch = (): FetchLike => fetch.bind(globalThis)

// `HostServer.bearerAuthorization` compares SHA-256 digests in constant time.
export const sha256Digest = (value: string): Buffer => createHash("sha256").update(value).digest()

export const digestEqual = (presented: Buffer, expected: Buffer): boolean => timingSafeEqual(presented, expected)
