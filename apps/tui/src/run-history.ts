/**
 * `/verify <run>` and `/fork <run> <at> [step=<digest> result=<json>]`: a
 * run's recorded history through the one service the gateway's `Run.Verify`
 * and `Run.Fork` call (`@smthrs/gateway/RunHistory`), so the terminal reads
 * the report the app and `smthrs runs verify` read and forks the way
 * `smthrs runs fork` does. `service` opens it over the project in-process
 * (`@smthrs/cli/history/GatewayHistory`). Each note is the transcript text;
 * the caller appends it.
 */
import * as GatewayHistory from "@smthrs/cli/history/GatewayHistory"
import type * as RunHistory from "@smthrs/gateway/RunHistory"
import { Cause, Effect, Exit, Option } from "effect"

/** The history service over the project at `root`, as `smthrs serve` hands it to its gateway. */
export const service = (root: string): RunHistory.Service => GatewayHistory.make(root)

const label = (step: RunHistory.Step): string => step.action ?? step.node ?? step.stepKeyDigest

/** The report as transcript lines: the verdict, then each list the report holds. */
export const verifyLines = (report: RunHistory.VerifyReport): ReadonlyArray<string> => [
  `${report.runId} ${report.verdict}`,
  `replays ${report.replayed.length}`,
  ...(report.resumes === undefined ? [] : [`resumes ${label(report.resumes)}`]),
  ...(report.executes === undefined ? [] : [`executes ${label(report.executes)}`]),
  ...(report.notReplayed.length === 0 ? [] : [`not replayed ${report.notReplayed.map(label).join(", ")}`])
]

/** The fork as a transcript line: the parked child and where it came from. */
export const forkLine = (fork: RunHistory.ForkOutput): string =>
  `${fork.runId} ${fork.status} (fork of ${fork.parentRunId})`

/** The host's refusal sentence; a defect reads as the one sentence nobody designed. */
const refusal = (cause: Cause.Cause<RunHistory.HistoryRefused>): string =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => "Something went wrong on our side. Not your fault.",
    onSome: (refused) => refused.message
  })

/** The note for `/verify <run>`. */
export const verify = async (argument: string, history: RunHistory.Service): Promise<string> => {
  const words = argument.trim().split(/\s+/).filter((word) => word !== "")
  if (words.length !== 1) return "Usage: /verify <run>"
  const exit = await Effect.runPromiseExit(history.verify({ runId: words[0]! }))
  return Exit.isSuccess(exit) ? verifyLines(exit.value).join("\n") : refusal(exit.cause)
}

/** Reads the `step=` / `result=` pair into the edit a fork carries; both or neither. */
const edit = (words: ReadonlyArray<string>): RunHistory.StepEdit | undefined | string => {
  const named = new Map<string, string>()
  for (const word of words) {
    const at = word.indexOf("=")
    if (at <= 0) return "Usage: /fork <run> <at> [step=<digest> result=<json>]"
    named.set(word.slice(0, at), word.slice(at + 1))
  }
  const step = named.get("step")
  const result = named.get("result")
  if ([...named.keys()].some((key) => key !== "step" && key !== "result")) {
    return "Usage: /fork <run> <at> [step=<digest> result=<json>]"
  }
  if (step === undefined && result === undefined) return undefined
  if (step === undefined || step === "" || result === undefined) return "step= and result= edit a step together"
  try {
    return { stepKeyDigest: step, result: JSON.parse(result) as RunHistory.StepEdit["result"] }
  } catch {
    return "result= must be JSON"
  }
}

/** The note for `/fork <run> <at> [step=<digest> result=<json>]`. */
export const fork = async (argument: string, history: RunHistory.Service): Promise<string> => {
  const [runId, at, ...rest] = argument.trim().split(/\s+/).filter((word) => word !== "")
  const frame = at === undefined || !/^\d+$/.test(at) ? undefined : Number(at)
  if (runId === undefined || frame === undefined || !Number.isSafeInteger(frame)) {
    return "Usage: /fork <run> <at> [step=<digest> result=<json>]"
  }
  const step = edit(rest)
  if (typeof step === "string") return step
  const exit = await Effect.runPromiseExit(
    history.fork({ runId, at: frame, ...(step === undefined ? {} : { step }) })
  )
  return Exit.isSuccess(exit) ? forkLine(exit.value) : refusal(exit.cause)
}
