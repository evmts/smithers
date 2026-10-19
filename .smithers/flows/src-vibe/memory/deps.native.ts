// E-7 (EK4402): node:crypto and fetch are platform APIs that VibeLang code does not call
// directly. memory/deps.vibe hashes bytes and fetches a document through these, exactly as
// memory/deps.ts does; fetchBounded is also a Promise boundary its TypeScript callers await (E-4).

import { createHash } from "node:crypto"

/** `sha256` hex of `bytes`. */
export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")

/** memory/deps.ts `fetchBounded`, with the class it throws and the size limit passed in. */
export const fetchBounded = async (
  TooLarge: new(message: string) => Error,
  maxDocBytes: number,
  url: string,
  timeoutMs: number
): Promise<Uint8Array> => {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`${url} answered ${response.status}`)
  }
  if (Number(response.headers.get("content-length") ?? 0) > maxDocBytes) {
    await response.body?.cancel()
    throw new TooLarge(`${url} declares more than ${maxDocBytes} bytes`)
  }
  const chunks: Array<Uint8Array> = []
  let total = 0
  if (response.body !== null) {
    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.byteLength
      if (total > maxDocBytes) {
        await reader.cancel()
        throw new TooLarge(`${url} streamed more than ${maxDocBytes} bytes`)
      }
    }
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
