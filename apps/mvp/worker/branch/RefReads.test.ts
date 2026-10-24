import { Effect, Option } from "effect"
import { SqlClient } from "effect/sql"
import { beforeEach, expect, test } from "vitest"
import { resetBranches } from "../test/branch.ts"
import { testFile } from "../test/harness.ts"
import * as Conversations from "./Conversations.ts"
import { visible } from "./RefReads.ts"

const runtime = testFile("branch_ref_reads")
beforeEach(() => resetBranches(runtime))
const repo = "github/o/r"
const actor = (id: string) => Option.some({ subject: { kind: "person" as const, id }, role: "member" as const })

test("only an owner or current share can discover an ephemeral ref; existing refs remain public", async () => {
  const make = (name: string, namespace: "default" | "ephemeral") =>
    runtime.runPromise(Conversations.track(repo, name, "open", "a".repeat(40), "owner", undefined, namespace))
  const { branch } = await make("private", "ephemeral")
  await make("ordinary", "default")
  expect(await runtime.runPromise(visible(repo, actor("owner")))).toEqual(["private"])
  expect(await runtime.runPromise(visible(repo, actor("other")))).toEqual([])
  expect(await runtime.runPromise(visible(repo, Option.none()))).toEqual([])
  await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql`INSERT INTO branch_shares (branch_id, grantee, login, access) VALUES (${branch.branchId}, 'other', 'other', 'view')`))
  expect(await runtime.runPromise(visible(repo, actor("other")))).toEqual(["private"])
  expect(await runtime.runPromise(visible("github/o/elsewhere", actor("owner")))).toEqual([])
  await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
    sql`UPDATE branches SET deleted_at = now() WHERE id = ${branch.branchId}`))
  expect(await runtime.runPromise(visible(repo, actor("owner")))).toEqual([])
})
