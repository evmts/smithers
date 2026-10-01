import * as RunHistory from "@smthrs/gateway/RunHistory"
import { describe, expect, test } from "bun:test"
import { Effect, Exit } from "effect"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Failures from "../src/failures.ts"
import * as Log from "../src/log.ts"
import * as History from "../src/run-history.ts"

/*
 * `/verify-run` and `/fork-run` read and fork through the gateway's
 * `RunHistory`: the terminal shows the report `Run.Verify` answers and forks
 * the way `Run.Fork` does, and refusals use fixed product copy. `served`
 * speaks the gateway frame a `smthrs serve` answers.
 */

const report: RunHistory.VerifyReport = {
  runId: "run-1",
  verdict: "divergent",
  replayed: [{ stepKeyDigest: "a", action: "verify/first" }, { stepKeyDigest: "n", node: "fetch" }],
  resumes: { stepKeyDigest: "r", node: "review" },
  executes: { stepKeyDigest: "c" },
  notReplayed: [{ stepKeyDigest: "b", action: "verify/second" }, { stepKeyDigest: "d" }]
}

const recording = () => {
  const forks: Array<RunHistory.ForkInput> = []
  const verifies: Array<RunHistory.VerifyInput> = []
  const service: RunHistory.Service = {
    fork: (input) =>
      Effect.sync(() => {
        forks.push(input)
        return { runId: `${input.runId}-fork`, parentRunId: input.runId, status: "parked" as const }
      }),
    verify: (input) =>
      Effect.sync(() => {
        verifies.push(input)
        return report
      })
  }
  return { forks, verifies, service }
}

const refusing: RunHistory.Service = {
  fork: () => Effect.fail(new RunHistory.HistoryRefused({ code: "history_frame_missing", message: "No frame 9" })),
  verify: () => Effect.fail(new RunHistory.HistoryRefused({ code: "history_missing", message: "No history" }))
}

const broken: RunHistory.Service = { fork: () => Effect.die("bug"), verify: () => Effect.die("bug") }
const unknown = "Run history could not be read. Details: /conversation"

describe("/verify-run", () => {
  test("prints the verdict and every list the report holds", async () => {
    const { service, verifies } = recording()
    expect(await History.verify(" run-1 ", service)).toBe(
      ["run-1 divergent", "replays 2", "resumes review", "executes c", "not replayed verify/second, d"].join("\n")
    )
    expect(verifies).toEqual([{ runId: "run-1" }])
  })

  test("omits what a consistent report does not hold", () => {
    expect(History.verifyLines({ runId: "run-2", verdict: "consistent", replayed: [], notReplayed: [] }))
      .toEqual(["run-2 consistent", "replays 0"])
  })

  test("refuses a missing or surplus run id without calling the host", async () => {
    const { service, verifies } = recording()
    for (const argument of ["", "   ", "run-1 run-2"]) {
      expect(await History.verify(argument, service)).toBe("Usage: /verify-run <run>")
    }
    expect(verifies).toEqual([])
  })

  test("prints fixed refusal copy and records unexpected defects", async () => {
    expect(await History.verify("run-1", refusing)).toBe("No recorded history for this run.")
    expect(await History.verify("run-1", broken)).toBe(unknown)
  })
})

describe("/fork-run", () => {
  test("forks at the frame and prints the parked child", async () => {
    const { service, forks } = recording()
    expect(await History.fork("run-1 4", service)).toBe("run-1-fork parked (fork of run-1)")
    expect(forks).toEqual([{ runId: "run-1", at: 4 }])
  })

  test("carries one step's edited result, whose JSON may hold spaces", async () => {
    const { service, forks } = recording()
    await History.fork(`run-1 0 step=b result={"text": "hello world"}`, service)
    await History.fork(`run-1 2  step=c   result=7 `, service)
    expect(forks).toEqual([
      { runId: "run-1", at: 0, step: { stepKeyDigest: "b", result: { text: "hello world" } } },
      { runId: "run-1", at: 2, step: { stepKeyDigest: "c", result: 7 } }
    ])
  })

  test("refuses a malformed address or edit without calling the host", async () => {
    const { service, forks } = recording()
    const usage = "Usage: /fork-run <run> <at> [step=<digest> result=<json>]"
    const pair = "step= and result= edit a step together"
    for (
      const [argument, answer] of [
        ["", usage],
        ["run-1", usage],
        ["run-1 -1", usage],
        ["run-1 1.5", usage],
        ["run-1 99999999999999999999", usage],
        ["run-1 0 lineage=main", usage],
        ["run-1 0 step", usage],
        ["run-1 0 step=b", pair],
        ["run-1 0 result=1", pair],
        ["run-1 0 step= result=1", pair],
        ["run-1 0 step=b result=  ", pair],
        ["run-1 0 step=b result={", "result= must be JSON"]
      ] as const
    ) {
      expect(await History.fork(argument, service)).toBe(answer)
    }
    expect(forks).toEqual([])
  })

  test("prints fixed refusal copy and records unexpected defects", async () => {
    expect(await History.fork("run-1 9", refusing)).toBe("That history frame is unavailable.")
    expect(await History.fork("run-1 9", broken)).toBe(unknown)
  })
})

describe("served", () => {
  /** A gateway double answering one exit line, recording the request. */
  const gateway = (exit: unknown, token?: string) => {
    const requests: Array<{ url: string; authorization: string | null; frame: unknown }> = []
    const history = History.served({
      url: "http://127.0.0.1:3000/",
      token,
      fetch: async (url, init) => {
        const headers = new Headers(init?.headers)
        requests.push({ url, authorization: headers.get("authorization"), frame: JSON.parse(String(init?.body)) })
        return new Response(
          typeof exit === "string" ? exit : `${JSON.stringify({ _tag: "Exit", requestId: "1", exit })}\n`
        )
      }
    })
    return { history, requests }
  }

  test("posts the gateway frame to /projections and decodes the answer", async () => {
    const child = { runId: "run-1-fork", parentRunId: "run-1", status: "parked" }
    const forking = gateway({ _tag: "Success", value: child }, "secret")
    expect(await Effect.runPromise(forking.history.fork({ runId: "run-1", at: 3 }))).toEqual(child as never)
    expect(forking.requests).toEqual([{
      url: "http://127.0.0.1:3000/projections",
      authorization: "Bearer secret",
      frame: { _tag: "Request", id: 1, tag: "Run.Fork", payload: { runId: "run-1", at: 3 }, headers: [] }
    }])
    const verifying = gateway({ _tag: "Success", value: report })
    expect(await Effect.runPromise(verifying.history.verify({ runId: "run-1" }))).toEqual(report)
    expect(verifying.requests[0]?.authorization).toBeNull()
  })

  test("reads a typed refusal as its code and sentence", async () => {
    const refusals = [
      [{ _tag: "@smthrs/gateway/HistoryRefused", code: "history_missing", message: "No history" }, "history_missing"],
      [{ _tag: "/control/Unauthorized", message: "An operator credential is required" }, "/control/Unauthorized"]
    ] as const
    for (const [error, code] of refusals) {
      const { history } = gateway({ _tag: "Failure", cause: [{ _tag: "Interrupt" }, { _tag: "Fail", error }] })
      expect(await Effect.runPromise(Effect.flip(history.verify({ runId: "run-1" }))))
        .toMatchObject({ _tag: "@smthrs/gateway/HistoryRefused", code, message: error.message })
    }
  })

  test("treats a defect, a malformed answer and a transport failure as defects", async () => {
    const answers = [
      gateway({ _tag: "Failure", cause: [{ _tag: "Die", defect: "boom" }] }).history,
      gateway({ _tag: "Success", value: { runId: "run-1", verdict: "maybe" } }).history,
      gateway("not json").history,
      gateway("").history,
      History.served({ url: "http://127.0.0.1:1", fetch: async () => Promise.reject(new Error("refused")) })
    ]
    for (const history of answers) {
      const exit = await Effect.runPromiseExit(history.verify({ runId: "run-1" }))
      expect(Exit.isFailure(exit) && exit.cause.reasons.every((reason) => reason._tag === "Die")).toBe(true)
    }
  })
})

test("real gateway history failure hides remote diagnostics, records them privately and recovers", async () => {
  const previous = process.env.SMITHERS_TUI_SESSION_DIR
  const root = mkdtempSync(join(tmpdir(), "tui-history-http-"))
  process.env.SMITHERS_TUI_SESSION_DIR = root
  const marker = `history-diagnostic-${crypto.randomUUID()}`
  const secret = `ghp_${"x".repeat(36)}`
  const requests: Array<{ authorization: string | null; frame: unknown }> = []
  let recovered = false
  let refusalCode = "history_failed"
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      expect(new URL(request.url).pathname).toBe("/projections")
      expect(request.method).toBe("POST")
      requests.push({ authorization: request.headers.get("authorization"), frame: JSON.parse(await request.text()) })
      return new Response(
        JSON.stringify({
          exit: recovered
            ? { _tag: "Success", value: report }
            : {
              _tag: "Failure",
              cause: [{
                _tag: "Fail",
                error: {
                  _tag: "@smthrs/gateway/HistoryRefused",
                  code: refusalCode,
                  message: `${marker} ${secret}`
                }
              }]
            }
        }) + "\n",
        { headers: { "content-type": "application/x-ndjson" } }
      )
    }
  })
  try {
    const history = History.served({ url: server.url.toString(), token: "test-operator" })
    const visible = await History.verify("run-1", history)
    expect(visible).toBe("Run history could not be read. Details: /conversation")
    expect(visible).not.toContain(marker)
    const records = readFileSync(Log.path(), "utf8").trim().split("\n").map((line) => JSON.parse(line))
    expect(records).toHaveLength(1)
    expect(records[0].detail).toContain(marker)
    expect(JSON.stringify(records)).not.toContain(secret)
    refusalCode = "future_unknown_history_code"
    expect(await History.fork("run-1 2", history)).toBe(unknown)
    expect(readFileSync(Log.path(), "utf8").trim().split("\n")).toHaveLength(2)
    recovered = true
    expect(await History.verify("run-1", history)).toBe(History.verifyLines(report).join("\n"))
    expect(requests).toEqual([
      { tag: "Run.Verify", payload: { runId: "run-1" } },
      { tag: "Run.Fork", payload: { runId: "run-1", at: 2 } },
      { tag: "Run.Verify", payload: { runId: "run-1" } }
    ].map(({ tag, payload }) => ({
      authorization: "Bearer test-operator",
      frame: {
        _tag: "Request",
        id: 1,
        tag,
        payload,
        headers: []
      }
    })))
    expect(readFileSync(Log.path(), "utf8").trim().split("\n")).toHaveLength(2)
  } finally {
    await server.stop(true)
    if (previous === undefined) delete process.env.SMITHERS_TUI_SESSION_DIR
    else process.env.SMITHERS_TUI_SESSION_DIR = previous
    rmSync(root, { recursive: true, force: true })
  }
})

test("designed history refusals never expose remote diagnostic text", async () => {
  for (
    const [code, expected] of [
      ["history_missing", "No recorded history for this run."],
      ["history_frame_missing", "That history frame is unavailable."]
    ] as const
  ) {
    const marker = `remote-${crypto.randomUUID()}`
    const refused = () => Effect.fail(new RunHistory.HistoryRefused({ code, message: marker }))
    const service: RunHistory.Service = { verify: refused, fork: refused }
    expect(await History.verify("run-1", service)).toBe(expected)
    expect(await History.fork("run-1 2", service)).toBe(expected)
  }
})

test("malformed real gateway replies fail safely and a later request still succeeds", async () => {
  const previous = process.env.SMITHERS_TUI_SESSION_DIR
  const root = mkdtempSync(join(tmpdir(), "tui-history-malformed-"))
  process.env.SMITHERS_TUI_SESSION_DIR = root
  let body = "not ndjson"
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(body) })
  try {
    const history = History.served({ url: server.url.toString() })
    expect(await History.verify("run-1", history)).toBe(unknown)
    const beforeRecovery = readFileSync(Log.path(), "utf8")
    expect(beforeRecovery).toContain("Run.Verify answered in an unknown shape")
    body = JSON.stringify({ exit: { _tag: "Success", value: report } }) + "\n"
    expect(await History.verify("run-1", history)).toBe(History.verifyLines(report).join("\n"))
    expect(readFileSync(Log.path(), "utf8")).toBe(beforeRecovery)
  } finally {
    await server.stop(true)
    if (previous === undefined) delete process.env.SMITHERS_TUI_SESSION_DIR
    else process.env.SMITHERS_TUI_SESSION_DIR = previous
    rmSync(root, { recursive: true, force: true })
  }
})

test("history reasons retain actionable fault classification and private detail conventions", () => {
  const previous = process.env.SMITHERS_TUI_SESSION_DIR
  const root = mkdtempSync(join(tmpdir(), "tui-history-reasons-"))
  process.env.SMITHERS_TUI_SESSION_DIR = root
  try {
    const cases = [
      ["/control/Unauthorized", "user", "Sign in with access to this run."],
      ["history_unsupported_run", "user", "This run does not support history changes."],
      ["run_active", "infra", "Wait for the run and its children to stop before changing history."],
      ["plan_not_approved", "policy", "Approve the run's plan before changing history."],
      ["verify_timeout", "infra", "History verification timed out."],
      ["irreversible", "policy", "This history includes an action that cannot be undone."],
      ["history_missing", "user", "No recorded history for this run."],
      ["history_frame_missing", "user", "That history frame is unavailable."],
      ["busy", "infra", "Wait for the run and its children to stop before changing history."],
      ["live_parent", "infra", "Wait for the run and its children to stop before changing history."],
      ["live_child", "infra", "Wait for the run and its children to stop before changing history."],
      ["fork_unavailable", "user", "The fork's workspace is unavailable."],
      ["not_found", "user", "That run or history frame is unavailable."],
      ["run_not_found", "user", "That run or history frame is unavailable."],
      ["invalid", "user", "The history request is invalid."],
      ["invalid_input", "user", "The history request is invalid."],
      ["already_crossed", "policy", "This history includes an action that cannot be undone."],
      ["rate_limited", "infra", "Too many history requests; try again later."],
      ["limit_exceeded", "user", "This run exceeds the history limit."],
      ["fence_lost", "infra", "The run's owner changed; retry the history request."],
      ["compensation_failed", "infra", "An action could not be undone."],
      ["verify_cleanup_failed", "infra", "History verification could not clean up its copies."],
      ["verify_schema_too_long", "user", "Shorten the configured database schema name before verifying."],
      ["run_divergent", "user", "The recorded run and its replay differ."],
      ["unauthorized", "user", "Sign in with access to this run."],
      ["unavailable", "infra", "Run history is unavailable here."],
      ["/control/Unavailable", "infra", "Run history is unavailable here."],
      ["unrecognized_future_code", "bug", "Run history could not be read."]
    ] as const
    const logged: Array<string> = []
    for (const [code, fault, sentence] of cases) {
      const marker = `private-${crypto.randomUUID()}`
      const refusal = new RunHistory.HistoryRefused({ code, message: marker })
      const presentation = Failures.present("history", refusal)
      expect(presentation.fault).toBe(fault)
      expect(presentation.sentence).toBe(sentence)
      expect(presentation.sentence).not.toContain(marker)
      expect(Failures.line("history", refusal)).toBe(fault === "user" ? sentence : `${sentence} Details: /conversation`)
      if (fault !== "user") logged.push(marker)
    }
    const records = readFileSync(Log.path(), "utf8").trim().split("\n").map((line) => JSON.parse(line))
    expect(records).toHaveLength(logged.length * 2)
    for (const marker of logged) expect(records.filter((record) => record.detail.includes(marker))).toHaveLength(2)
    expect(records.every((record) => record.tag === "failure.history")).toBe(true)
  } finally {
    if (previous === undefined) delete process.env.SMITHERS_TUI_SESSION_DIR
    else process.env.SMITHERS_TUI_SESSION_DIR = previous
    rmSync(root, { recursive: true, force: true })
  }
})
