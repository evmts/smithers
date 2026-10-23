// The live conversation-archive eval found the agent harness omitted the real archive route.
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { expect, test } from "vitest"
import { answers, testFile } from "../../../worker/test/harness.ts"
import { answerRow, cell, member, openAgent } from "../../test/agent"
import { openDevice } from "../../test/device"

const runtime = testFile("agent_archive")

test("the agent archives its current conversation through the real route while answering", async () => {
  const agent = await openAgent(runtime, answers(cell(
    'const result = await ctx.call("conversation/archive", { archived: true }); ' +
    'ctx.done(result.ok === false ? "Could not archive." : "Archived.")',
  )))
  const device = await openDevice(agent.fetch)
  try {
    const answerId = await agent.ask("Archive this conversation for me.")
    await Effect.runPromise(device.dispatch.dispatch("chat/Answer", { answerId }, { door: "composer", executionId: answerId }))
    expect(await answerRow(runtime, answerId)).toMatchObject({ status: "done", text: "Archived." })
    const rows = await runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, (sql) =>
      sql<{ archived: boolean }>`SELECT archived_at IS NOT NULL AS archived FROM conversation_people WHERE person_id = ${member.subject.id}`))
    expect(rows).toEqual([{ archived: true }])
  } finally { await device.close() }
}, 90_000)
