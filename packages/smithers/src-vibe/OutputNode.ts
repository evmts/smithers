// E-7 (EK4402): Buffer and node:util/types are Node platform APIs that VibeLang
// code does not call directly. Output.vibe measures strings and refuses
// proxies through these, exactly as Output.ts does.
import { isProxy } from "node:util/types"

/** The UTF-8 byte length of `text`, as `Buffer.byteLength(text)` counts it. */
export const utf8ByteLength = (text: string): number => Buffer.byteLength(text)

/** Whether `value` is a Proxy. */
export const isProxyValue = (value: unknown): boolean => isProxy(value)
