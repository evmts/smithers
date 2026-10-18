/**
 * Reading a response body with a cap, so no answer, however long, can exhaust
 * a Worker's memory.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"

/**
 * What {@link readAtMost} read: the bytes, and whether the stream had more than the cap.
 *
 * @category models
 * @since 0.1.0
 */
export interface Bounded {
  readonly bytes: Uint8Array
  readonly truncated: boolean
}

const concat = (chunks: ReadonlyArray<Uint8Array>, size: number): Uint8Array => {
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

/**
 * Reads a byte stream up to `maxBytes`, stopping early once `enough` holds
 * for what it has read. A stream longer than the cap is cut there and marked
 * `truncated`; pulling stops, so the rest is never read.
 *
 * @category reads
 * @since 0.1.0
 */
export const readAtMost = <E, R>(
  stream: Stream.Stream<Uint8Array, E, R>,
  maxBytes: number,
  enough: (bytes: Uint8Array) => boolean = () => false
): Effect.Effect<Bounded, E, R> =>
  Effect.suspend(() => {
    const chunks: Array<Uint8Array> = []
    let size = 0
    let truncated = false
    return Stream.runForEachWhile(stream, (chunk) =>
      Effect.sync(() => {
        if (size + chunk.length > maxBytes) {
          chunks.push(chunk.subarray(0, maxBytes - size))
          size = maxBytes
          truncated = true
          return false
        }
        chunks.push(chunk)
        size += chunk.length
        return !enough(concat(chunks, size))
      })).pipe(Effect.map(() => ({ bytes: concat(chunks, size), truncated })))
  })
