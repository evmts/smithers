// A-2/E-4 (D38): the `smthrs` executable's process handling stays in
// TypeScript, verbatim from cli/LegacyBin.ts: the SIGINT/SIGTERM listeners it
// installs when it loads, the failure report it writes to stderr, the
// teardown that maps an exit to a process status, and NodeRuntime.runMain.
// E-7/EK4402: process.once, process.argv, process.stderr, process.exitCode
// and process.env are platform APIs. LegacyBin.vibe holds the program `main`.
import { NodeRuntime } from "@effect/platform-node"
import * as NodeDatabase from "@smthrs/database/node/NodeDatabase"
import * as RedactedLogger from "@smthrs/journal/RedactedLogger"
import * as Redaction from "@smthrs/journal/Redaction"
import { Cause, Effect, Exit, Logger, Runtime } from "effect"
import { CliError as EffectCliError } from "effect/cli"
import * as CliError from "../CliError.vibe"
import * as Failure from "../internal/Failure.ts"
import * as Telemetry from "../internal/Telemetry.vibe"
import * as Argv from "./Argv.ts"

let signalExitCode: 130 | 143 | undefined

const onSigint = () => {
  signalExitCode = 130
}

const onSigterm = () => {
  signalExitCode = 143
}

process.once("SIGINT", onSigint)
process.once("SIGTERM", onSigterm)

/**
 * A CLI failure is a sentence for the operator, on stderr.
 *
 * Effect's default error reporting logs the cause through the runtime logger,
 * which writes to STDOUT with a timestamp and a stack. For a command-line tool
 * that is two bugs at once: a script reading `--json` gets a log line in its
 * document, and an operator gets a stack trace where the contract promised a
 * migration message. Reporting is therefore disabled below and the message is
 * written here instead.
 */
const verboseRequested = (): boolean => {
  try {
    return Argv.parse(process.argv.slice(2)).verbose
  } catch {
    return false
  }
}

const report = (error: unknown): void => {
  const message = error instanceof CliError.UsageError ||
      error instanceof CliError.UnsupportedError ||
      error instanceof CliError.ResourceLimitError ||
      error instanceof CliError.RenderingError
    ? error.message
    // A refused database open is a defect by design: `NodeDatabase.layer` keeps
    // the `never` error channel eleven packages compose against, so the refusal
    // arrives here rather than as a typed failure. Render it by its contract
    // code, which is what the release policy promises an operator and what a
    // script greps for; the tagged-error name is an implementation detail of
    // how the value travelled.
    : NodeDatabase.isUnsupportedDatabase(error)
    ? `${error.code}: ${error.message}`
    : Failure.operatorLine(error, verboseRequested())
  // A failure sentence is written here rather than logged, so it misses the
  // redacting logger below. It is still a line an operator reads and a
  // collector keeps, so it takes the same rules (the release policy).
  process.stderr.write(`${String(Redaction.redactDiagnostic(message))}\n`)
}

const teardown: Runtime.Teardown = (exit, onExit) => {
  process.removeListener("SIGINT", onSigint)
  process.removeListener("SIGTERM", onSigterm)

  if (signalExitCode !== undefined) {
    onExit(signalExitCode)
    return
  }
  if (Exit.isSuccess(exit)) {
    onExit(typeof process.exitCode === "number" ? process.exitCode : Number(process.exitCode ?? 0))
    return
  }
  if (Cause.hasInterruptsOnly(exit.cause)) {
    process.stderr.write("smthrs: startup was interrupted without a signal\n")
    onExit(1)
    return
  }

  const error = Cause.squash(exit.cause)
  if (EffectCliError.isCliError(error)) {
    // `effect/cli` renders its own help and usage output; only the
    // status is this module's to decide.
    onExit(error._tag === "ShowHelp" && error.errors.length === 0 ? 0 : 2)
    return
  }
  report(error)
  if (
    error instanceof CliError.UsageError ||
    error instanceof CliError.UnsupportedError ||
    error instanceof CliError.ResourceLimitError ||
    error instanceof CliError.RenderingError
  ) {
    onExit(CliError.exitCode(error))
    return
  }
  onExit(Runtime.getErrorExitCode(error))
}

/**
 * Diagnostics go to stderr, so stdout carries only the document.
 *
 * `report` above already keeps CLI failures off stdout, but the runtime logger
 * is the other writer. A run's own lifecycle warnings, `An agent run failed`
 * and its rendered cause, are logged by `@smthrs/agent` through the default
 * logger, which calls `console.log`. Under `--json` that put forty lines of
 * warning inside the one document an attached launch prints, so a pipeline
 * step parsing `smthrs up <flow> --json` read a syntax error instead of the
 * receipt it was promised (the release policy, the `up` row). `LogToStderr`
 * is the reference Effect provides for exactly this: keep stdout for protocol
 * output and send every built-in logger to `console.error`.
 *
 * `RedactedLogger.layer` then puts every one of those lines through the rules
 * `@smthrs/journal` applies on the write path, so a credential an action hands
 * to `Effect.logInfo` no longer reaches the operator's terminal, the
 * `--json` stderr stream, or `.flows/logs/<runId>.log` under a detached
 * launch (the release policy). The durable engine installs the same layer
 * beneath itself, and wrapping is idempotent, so a detached `smthrs run`
 * pays the rules once.
 */
export const runMain = <E>(main: Effect.Effect<void, E>): void =>
  NodeRuntime.runMain(
  Effect.provideService(main, Logger.LogToStderr, true).pipe(
    Effect.provide(RedactedLogger.layer()),
    Effect.provide(Telemetry.layer(process.env))
  ),
  {
    teardown,
    disableErrorReporting: true
  }
)
