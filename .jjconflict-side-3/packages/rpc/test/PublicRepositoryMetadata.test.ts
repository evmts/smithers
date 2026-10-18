import { expect, test } from "vitest"
import { PublicRepositoryRecordSchema, PublicRepositoryRecordsSchema } from "../src/PublicRepositoryMetadata.ts"
test("public issue and pull reads retain the upstream shape", () => {
  const issue = { number: 7, title: "Fix", state: "open", body: "Details", user: { login: "person" }, labels: [] }
  expect(PublicRepositoryRecordsSchema.parse([issue])).toEqual([issue])
  expect(PublicRepositoryRecordSchema.parse({ ...issue, merged: true })).toEqual({ ...issue, merged: true })
  expect(PublicRepositoryRecordSchema.safeParse({ ...issue, number: 0 }).success).toBe(false)
})
