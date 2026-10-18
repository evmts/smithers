import { expect, test } from "bun:test"
import convert from "../../../../../packages/backend/internal/guest/testdata/convert/flow"
import { Schema } from "effect"

test("the pinned repository converter fixture exposes the typed source contract", () => {
  const input = { source: 'import { Effect } from "effect"', idempotencyKey: "fixture-1", sourceLabel: "direct" } as const
  expect(Schema.decodeUnknownSync(convert.payloadSchema)(input)).toEqual(input)
  expect(() => Schema.decodeUnknownSync(convert.payloadSchema)({ ...input, sourceLabel: "untrusted" })).toThrow()
})
