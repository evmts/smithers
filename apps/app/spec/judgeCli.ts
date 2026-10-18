import { Effect } from "effect"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { exitCode, record, replay, type JudgmentRequest } from "./judgments.ts"
import { seatEvaluator } from "./seatEvaluator.ts"
import type { JudgePolicy } from "../../../packages/smithers/build/targets/src/Factory.ts"

/** Standalone boundary until spec/run.ts is handed off. Config modules export a resolved `seat`. */
export const judgeCli = async (args: readonly string[]): Promise<number> => {
  const [command, requestPath, sidecar, policyPath, seatConfig, ledger] = args
  if (!requestPath || !sidecar || !policyPath || !["replay", "record"].includes(command!)) throw new Error("judgeCli replay|record request.json sidecar.json factory.json [seat.ts budget.json]")
  const request: JudgmentRequest = JSON.parse(await readFile(requestPath, "utf8"))
  const policy: typeof JudgePolicy.Type | undefined = JSON.parse(await readFile(policyPath, "utf8")).judges
  if (command === "replay") {
    const result = await replay(sidecar, request, policy)
    console.log(JSON.stringify(result))
    return exitCode(result)
  }
  if (process.env.CI || !seatConfig || !ledger || !policy) {
    console.log(JSON.stringify({ verdict: "inconclusive", reason: "Recording requires local policy, seat and ledger" }))
    return 5
  }
  const { seat } = await import(pathToFileURL(resolve(seatConfig)).href)
  const evaluator = await Effect.runPromise(seatEvaluator(seat, policy.engines[request.kind].model))
  const result = await record({ path: sidecar, request, policy, evaluator, ledger, run: process.env.SMITHERS_SPEC_RUN ?? `judge-${crypto.randomUUID()}`, pendingLabels: `${sidecar}.pending-labels.jsonl` })
  console.log(JSON.stringify(result))
  return exitCode(result)
}

if (import.meta.main) judgeCli(process.argv.slice(2)).then((code) => { process.exitCode = code }).catch(() => { console.error("Judgment inconclusive"); process.exitCode = 5 })
