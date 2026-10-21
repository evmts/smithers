// A fixture for the queue's code view: a small module with comments, strings, numbers, types and calls.
import { Effect, Schema } from "effect"

/** One row of a shape, as Electric sends it. */
export interface Row {
  readonly id: string
  readonly offset: number
}

export const DEFAULT_LIMIT = 1_000
const greeting = `hello ${"world"}`

export class ShapeStream {
  private rows: Array<Row> = []

  constructor(readonly url: string) {}

  /* Appends a row unless the stream is full. */
  push(row: Row): boolean {
    if (this.rows.length >= DEFAULT_LIMIT) return false
    this.rows.push(row)
    return true
  }

  latest(): Row | undefined {
    return this.rows.at(-1)
  }
}

export const decodeRow = Schema.decodeUnknown(Schema.Struct({ id: Schema.String, offset: Schema.Number }))

export const load = (url: string) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise(() => fetch(url))
    const body = yield* Effect.tryPromise(() => response.json())
    return yield* decodeRow(body)
  })

export function describe(stream: ShapeStream): string {
  const last = stream.latest()
  return last ? `${stream.url} at ${last.offset}` : `${stream.url} is empty`
}

// Padding so the view scrolls.
export const a01 = 1
export const a02 = 2
export const a03 = 3
export const a04 = 4
export const a05 = 5
export const a06 = 6
export const a07 = 7
export const a08 = 8
export const a09 = 9
export const a10 = 10
export const a11 = 11
export const a12 = 12
export const a13 = 13
export const a14 = 14
export const a15 = 15
export const a16 = 16
export const a17 = 17
export const a18 = 18
export const a19 = 19
export const a20 = 20
export const a21 = 21
export const a22 = 22
export const a23 = 23
export const a24 = 24
export const a25 = 25
