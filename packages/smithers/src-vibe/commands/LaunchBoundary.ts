// A-2/E-4 (D38): the admission probe a detached launch hands to Detached.launch
// is a Promise-returning runner boundary (Effect.runPromise).
// S19-30: the launch waits for the child's termination and reaping when it is
// interrupted, through Effect.callback's Effect finalizer; VibeLang's callback
// hatch cannot wait on an asynchronous cleanup. commands/Launch.vibe's `start`
// calls this exactly where commands/Launch.ts builds the same two values.
import type { Control as ControlService } from "@smthrs/control"
import { Effect } from "effect"
import * as Detached from "../Detached.vibe"
import * as RunReads from "./RunReads.vibe"

/** The detached launch `Launch.start` waits for, with its admission probe. */
export const launchDetached = (
  control: ControlService.Service,
  planId: string | undefined,
  projectRoot: string,
  approval: object,
  passthrough: ReadonlyArray<string>,
  timeoutMs: number | undefined
): Effect.Effect<Detached.Launched | Detached.Rejected> => {
  const admission = (runId: string) =>
    Effect.runPromise(
      RunReads.summary(control, runId).pipe(
        Effect.map((summary) => planId !== undefined && summary !== undefined && summary.planId === planId)
      )
    )
  return Effect.callback<Detached.Launched | Detached.Rejected>((resume, signal) => {
    const pending = Detached.launch({
      root: projectRoot,
      payload: JSON.stringify({ ...approval, scope: "run" }),
      passthrough,
      signal,
      admission,
      ...(timeoutMs === undefined ? {} : { timeoutMs })
    })
    pending.then((result) => resume(Effect.succeed(result)), (error) => resume(Effect.die(error)))
    // Interruption aborts the signal first. Wait for termination and reaping
    // before the CLI scope can close and the process can exit.
    return Effect.promise(() => pending.then(() => undefined, () => undefined))
  })
}
