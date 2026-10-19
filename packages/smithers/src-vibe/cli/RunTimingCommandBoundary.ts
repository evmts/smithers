// A-2/E-4/E-5 (D38): the `--timing` answer is an async function handed to
// `Presentation.guard`, so it stays in TypeScript (EK1003), verbatim from
// cli/RunTimingCommand.ts. RunTimingCommand.vibe supplies the read program
// (`report`) and the refusal (`unknownRun`). E-7/EK4402: process.env is read
// here, where RunTimingCommand.ts reads it.
import type { Control } from "@smthrs/control"
import type { Effect } from "effect"
import type * as CliError from "../CliError.vibe"
import * as Globals from "../commands/Globals.vibe"
import * as Bridge from "./ControlBridge.vibe"
import type * as RunTiming from "./RunTiming.ts"

/** The async `--timing` answer for one parsed invocation. */
export const answer = <E>(
  c: any,
  runtime: Bridge.Runtime,
  unknownRun: (runId: string) => CliError.Refused,
  report: (runId: string) => Effect.Effect<RunTiming.Report, E, Control.Control>
) =>
async () => {
  const runId: string = c.args.run
  if (!Bridge.hasRecords(c.options, runtime)) {
    await Bridge.project(Globals.guard({ environment: runtime.environment ?? process.env }), c.options, runtime)
    throw unknownRun(runId)
  }
  return Bridge.read(report(runId), c.options, runtime)
}
