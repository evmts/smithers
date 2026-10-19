// A-2/E-4 (D38): `verify` awaits Effect.runPromiseExit, a runner boundary that hands a Promise to
// TypeScript callers, so its body stays TypeScript, unchanged from run-history.ts. run-history.vibe
// passes its private `refusal` in.
import type * as RunHistory from "@smthrs/gateway/RunHistory"
import { type Cause, Effect, Exit } from "effect"
import { verifyLines } from "./run-history.vibe"

/** run-history.ts `verify`, unchanged. */
export const verify = async (
  argument: string,
  history: Pick<RunHistory.Service, "verify">,
  refusal: (cause: Cause.Cause<RunHistory.HistoryRefused>) => string
): Promise<string> => {
  const words = argument.trim().split(/\s+/).filter((word) => word !== "")
  if (words.length !== 1) return "Usage: /verify-run <run>"
  const exit = await Effect.runPromiseExit(history.verify({ runId: words[0]! }))
  return Exit.isSuccess(exit) ? verifyLines(exit.value).join("\n") : refusal(exit.cause)
}
