import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "../../../scripts/test-child"
import { terminalSkillProof } from "./terminal-skill-proof"

/*
 * Every case runs the proof script in a real CPython, one to six launches per test, so the budget is the launches'
 * own rather than bun:test's 5 s default (gate 1, runs 38556009956 and 38558094099). The launches are supervised
 * from Node rather than taken synchronously from Bun, which can answer for a child that already finished (#3763):
 * on gate 1 (run 38700479725, job 116307187784) four launches whose proof had in fact passed were named ETIMEDOUT
 * at exactly 20 s, while that job's other thirteen cases of this file took 23-214 ms, so the budget was not short.
 * Each launch is still bounded in turn: a wedged interpreter is killed with its group and named, instead of
 * silently spending the test's budget and outliving it.
 */
setDefaultTimeout(60_000)
const LAUNCH_BUDGET_MS = 20_000

const transcript = (command: string, content: unknown, isError: boolean) => [
  { message: { content: [{ type: "tool_use", name: "Bash", id: "call", input: { command } }] } },
  { message: { content: [{ type: "tool_result", tool_use_id: "call", content, is_error: isError }] } },
  { type: "result", subtype: "success", is_error: false }
]
const run = (messages: unknown[], expected = ["todo new"], confirmation: string | undefined = "todo new", refusal?: { code: string; message: string }) => {
  const result = spawnSync("/usr/bin/python3", ["-c", terminalSkillProof(expected, refusal ? undefined : confirmation, refusal)], {
    input: messages.map(message => JSON.stringify(message)).join("\n"), encoding: "utf8", timeout: LAUNCH_BUDGET_MS
  })
  // A launch that never finishes is the proof failing, not the receipt passing: name it rather than leave the
  // caller reading a status of null.
  if (result.error) throw new Error(`The proof interpreter did not finish within ${LAUNCH_BUDGET_MS} ms: ${result.error.message}`)
  return result
}
const pending = { confirmation: "private-card-1", state: "pending", message: "Waiting for ben to confirm" }

describe("installed Claude skill execution receipts", () => {
  test.each([false, true])("pending CLI exit 3 is accepted with tool is_error=%s", isError => {
    const result = run(transcript("smthrs todo new --text Fix --json", `Exit code 3\n${JSON.stringify(pending)}`, isError))
    expect(result.status).toBe(0)
    expect(result.stdout).toBe("J6CONFIRMATION=private-card-1\nJ6SKILL=executed\n")
  })
  test("merge receipt supports structured text blocks", () => {
    const result = run(transcript("smthrs merge T1 --json", [{ type: "text", text: JSON.stringify(pending) }], true), ["merge"], "merge")
    expect(result.status).toBe(0)
  })
  test.each([
    { state: "pending" }, { confirmation: "", state: "pending" },
    { confirmation: "   ", state: "pending" }, { confirmation: 42, state: "pending" },
    { confirmation: "private-card-1", state: "requested" }, { class: "infra", code: "todo_unavailable" }
  ])("refuses invalid or failed confirmation: %j", receipt => {
    expect(run(transcript("smthrs todo new --json", JSON.stringify(receipt), true)).status).not.toBe(0)
  })
  test("pending receipt from another tool does not excuse its failure", () => {
    expect(run(transcript("smthrs wiki show --json", JSON.stringify(pending), true)).status).not.toBe(0)
  })
  test("an issued command without a result is not completion", () => {
    const messages = transcript("smthrs todo new --json", JSON.stringify(pending), false)
    messages.splice(1, 1)
    expect(run(messages).status).not.toBe(0)
  })
  test("the missing-consumer refusal must be literal", () => {
    const refusal = { code: "confirm_in_app", message: "Confirm in the app" }
    const messages = transcript("smthrs todo new --json", JSON.stringify({ class: "permission", ...refusal }), true)
    expect(run(messages, ["todo new"], undefined, refusal).status).toBe(0)
    expect(run(messages, ["todo new"], undefined, { ...refusal, code: "permission" }).status).not.toBe(0)
  })
  test("plain success prose cannot qualify answer or steer", () => {
    for (const name of ["todo answer", "todo steer", "wiki"]) {
      expect(run(transcript(`smthrs ${name} --json`, "Done", false), [name], "").status).not.toBe(0)
      expect(run(transcript(`smthrs ${name} --json`, JSON.stringify({ ok: true }), false), [name], "").status).toBe(0)
    }
  })
  test("a typed refusal fails even when Claude marks its tool successful", () => {
    expect(run(transcript("smthrs todo answer --json", JSON.stringify({ class: "permission", code: "permission" }), false), ["todo answer"], "").status).not.toBe(0)
  })
  test("wiki list receipts qualify without treating nested examples as errors", () => {
    for (const receipt of [[], [{ title: "Authorization", example: { class: "permission", code: "permission" } }]]) {
      expect(run(transcript("smthrs wiki list --json", JSON.stringify(receipt), false), ["wiki"], "").status).toBe(0)
    }
  })
  test("a nested pending example is not a command confirmation", () => {
    expect(run(transcript("smthrs todo new --json", JSON.stringify({ example: pending }), false)).status).not.toBe(0)
  })
  test("a later failed tool or final Claude failure invalidates the transcript", () => {
    const messages: unknown[] = transcript("smthrs todo new --json", JSON.stringify(pending), true)
    messages.splice(2, 0, { message: { content: [{ type: "tool_result", tool_use_id: "other", content: "failed", is_error: true }] } })
    expect(run(messages).status).not.toBe(0)
    messages.splice(2, 1)
    messages[2] = { type: "result", subtype: "error_during_execution", is_error: true }
    expect(run(messages).status).not.toBe(0)
  })
})

/*
 * The launch itself, with no proof script. Bun's synchronous spawn can answer for a child that already
 * finished (#3763): on gate 1 (run 38700479725, job 116307187784) it named ETIMEDOUT at exactly 20 s for
 * the four launches whose proof had in fact passed, while that job's other thirteen cases of this file took
 * 23-214 ms. An unsupervised launch there answers status 0 BESIDE that error, so a proof that passed reads
 * as one that never finished.
 * Here the leader exits at once and leaves a descendant holding its pipes, which answers deterministically
 * what that race answers by chance: a launch the budget kills reports no exit status, so a killed launch can
 * never read as a proof that passed or as one that refused. scripts/test-child owns the kill and the bound;
 * this case holds the launcher above to them, and goes red again on an unsupervised synchronous launch.
 */
test("a launch the budget kills reports no exit status", () => {
  const leaks = "import subprocess,sys\nsubprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'],stdout=1,stderr=2)\nprint('left')"
  const started = Date.now()
  const result = spawnSync("/usr/bin/python3", ["-c", leaks], { encoding: "utf8", timeout: 500 })
  expect((result.error as NodeJS.ErrnoException | undefined)?.code).toBe("ETIMEDOUT")
  expect(result.status).toBeNull()
  expect(Date.now() - started).toBeLessThan(LAUNCH_BUDGET_MS)
})
