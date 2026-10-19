// A-2/E-4/E-5 (D38): the Promise-returning runner boundaries of
// ControlBridge.vibe stay in TypeScript, verbatim from cli/ControlBridge.ts:
// each is an async function (EK1003) that runs a program with
// Effect.runPromiseExit (EK1005), and `local` throws its configuration errors
// synchronously before handing the program to `project`. `display` and
// `provideServices`, which only these boundaries use, build the per-invocation
// services from eager platform reads (process.stdin, process.stderr,
// process.env) and stay with them (E-7/EK4402, A-4/D269). E-7/EK4402:
// processEnvironment and workingDirectory are ControlBridge.vibe's
// process.env and process.cwd() reads.
import { NodeServices } from "@effect/platform-node"
import * as Audience from "@smthrs/build-cli/Audience"
import { ApprovalAuthority, type Control } from "@smthrs/control"
import * as RedactedLogger from "@smthrs/journal/RedactedLogger"
import type * as Otlp from "@smthrs/observability/Otlp"
import type * as Registry from "@smthrs/registry/Registry"
import { Cause, Console, Effect, Exit, Layer, Logger, References } from "effect"
import { Command } from "effect/cli"
import { randomBytes } from "node:crypto"
import { format } from "node:util"
import * as CliError from "../CliError.vibe"
import { cli as legacyCli } from "../Command.vibe"
import * as ExecutionTarget from "../history/ExecutionTarget.vibe"
import * as GatewayHistory from "../history/GatewayHistory.vibe"
import * as HistoryWorkspace from "../history/History.vibe"
import * as CommandStatus from "../internal/CommandStatus.vibe"
import * as Telemetry from "../internal/Telemetry.vibe"
import * as NodeControl from "../NodeControl.vibe"
import { layerTriggerScheduler } from "../operator/Triggers.vibe"
import * as Project from "../Project.vibe"
import * as Serve from "../Serve.vibe"
import * as Ui from "../Ui.vibe"
import * as Verb from "../Verb.vibe"
import { packageVersion } from "../Version.ts"
import * as Argv from "./Argv.ts"
import { configuration, type ConnectionOptions, connectionArguments, type Runtime } from "./ControlBridge.vibe"
import * as Presentation from "./Presentation.ts"
import * as RunProgress from "./RunProgress.vibe"

/** `process.env`, read where ControlBridge.ts reads it. */
export const processEnvironment = (): Readonly<Record<string, string | undefined>> => process.env

/** `process.cwd()`, read where ControlBridge.ts reads it. */
export const workingDirectory = (): string => process.cwd()

/** The display policy one invocation renders progress and prompts under. */
const display = (options: ConnectionOptions, runtime: Runtime) => {
  const session = Presentation.current()
  const explicit = session?.policy ?? runtime.presentation
  const policy = explicit ?? Audience.resolve({ env: runtime.environment })
  return {
    policy: options.quiet ? { ...policy, progress: "silent" as const, interactive: false } : policy,
    // Only an explicit or quiet silence lowers the log floor; the ambient
    // audience fallback keeps operator-facing logs visible.
    logLevel: options.quiet || explicit?.progress === "silent" ? "Error" as const : "Info" as const,
    output: session?.stderr ?? process.stderr
  }
}

/**
 * The per-invocation services every typed verb reads, whichever host it runs
 * against: the prompt surface, the progress sink, and the redacting logger.
 */
const provideServices = <A, E, R>(
  operation: Effect.Effect<A, E, R>,
  options: ConnectionOptions,
  runtime: Runtime
): Effect.Effect<A, E | Otlp.LayerError, Exclude<R, Ui.Ui>> => {
  const { logLevel, output, policy } = display(options, runtime)
  return operation.pipe(
    Effect.provideService(RunProgress.Configuration, { policy, output }),
    Effect.provideService(References.MinimumLogLevel, logLevel),
    Effect.provideService(
      Ui.Ui,
      Ui.make({ output, input: process.stdin, interactive: policy.interactive })
    ),
    Effect.provideService(Logger.LogToStderr, true),
    Effect.provide(RedactedLogger.layer()),
    Effect.provide(Telemetry.layer(runtime.environment ?? process.env))
  )
}

const settle = async <A, E>(operation: Effect.Effect<A, E>, runtime: Runtime): Promise<A> => {
  const result = await Effect.runPromiseExit(operation, { signal: runtime.signal })
  if (Exit.isFailure(result)) throw Cause.squash(result.cause)
  return result.value
}

/**
 * Reuses the tested flow control handlers without starting a second process.
 * @category constructors
 * @since 1.0.0
 * @deprecated Use query, launch or read with shared command Effects; removed in #3634 phase 2.
 */
export const invoke = async (
  args: ReadonlyArray<string>,
  options: ConnectionOptions,
  runtime: Runtime = {}
): Promise<unknown> => {
  const { output: progressOutput, policy } = display(options, runtime)
  let config = configuration(options, runtime)
  if (config.remote === undefined && runtime.executionRoot === undefined) {
    // The same extraction the legacy executable uses, so a flat alias binds
    // to the same worktree whichever entry it arrived through.
    const runId = ExecutionTarget.executionRunId(args)
    if (runId !== undefined) {
      config = { ...config, ...await HistoryWorkspace.prepare(Project.root(config.root, process.cwd()), runId) }
    }
  }
  const values: Array<unknown> = []
  const outputConsole: Console.Console = Object.assign(Object.create(console), {
    error: (...items: ReadonlyArray<unknown>) => {
      if (policy.progress !== "silent") progressOutput.write(`${RunProgress.text(format(...items), 500)}\n`)
    },
    log: (...items: ReadonlyArray<unknown>) => {
      for (const item of items) {
        if (typeof item !== "string") values.push(item)
        else {
          try {
            values.push(JSON.parse(item))
          } catch {
            values.push(item)
          }
        }
      }
    }
  })
  const commandArguments = [
    "--json",
    // Quiet suppresses progress, not the returned data. Silence the progress
    // sink without changing the handler's result projection.
    ...connectionArguments({ ...options, quiet: false }),
    ...args
  ]
  const run: Effect.Effect<void, unknown, Ui.Ui> = Command.runWith(legacyCli, { version: packageVersion })(
    commandArguments
  ).pipe(
    // The flat verb these arguments name is what decides whether this host
    // composes an executor, and so whether it needs a completion judge. A
    // canonical verb that starts a run reaches it through exactly this call
    // (`flow start` is `up`, `approvals approve` is `approve`), so the verb
    // catalog stays the one authority on the question.
    Effect.provide(NodeControl.layer({
      ...config,
      startsRuns: Verb.startsRuns(Argv.words(args)),
      plansFlows: Argv.words(args)[0] === "plan"
    })),
    Effect.provide(NodeServices.layer),
    Effect.provideService(Console.Console, outputConsole),
    Effect.provideService(CommandStatus.CommandStatus, (code) => runtime.exit?.(code))
  )
  const result = await Effect.runPromiseExit(provideServices(run, options, runtime), { signal: runtime.signal })
  if (Exit.isFailure(result)) throw Cause.squash(result.cause)
  return values.length === 1 ? values[0] : values
}

/**
 * Runs a typed verb against the same local or remote host as flow commands.
 *
 * The host layer also carries the project references, so a verb that reads
 * `Project.ProjectRoot` or the 0.x snapshot sees the host's answer.
 *
 * The host observes runs and drives none, so it opens with no gateway key: a
 * flow listing, a run diagnosis, a pending-approval listing and a bulk cancel
 * all work in a project that has never had one. An operation that starts or
 * resumes a run does not belong here and its launch would die on the observing
 * executor; route one through {@link launch}.
 * @category constructors
 * @since 1.0.0
 */
export const query = async <A, E>(
  operation: Effect.Effect<A, E, Control.Control | Ui.Ui>,
  options: ConnectionOptions,
  runtime: Runtime = {},
  hostOptions: { readonly plansFlows?: boolean } = {}
): Promise<A> =>
  settle(
    provideServices(
      operation.pipe(
        Effect.provideService(CommandStatus.CommandStatus, (code) => runtime.exit?.(code)),
        Effect.provide(NodeControl.layer({ ...configuration(options, runtime), startsRuns: false, ...hostOptions }))
      ),
      options,
      runtime
    ),
    runtime
  )

/**
 * Runs a typed launch with an executor and host-owned settlement status.
 * @category constructors
 * @since 1.0.0
 */
export const launch = async <A, E>(
  operation: Effect.Effect<A, E, Control.Control | Ui.Ui>,
  options: ConnectionOptions,
  runtime: Runtime = {}
): Promise<A> =>
  settle(
    provideServices(
      operation.pipe(
        Effect.provideService(CommandStatus.CommandStatus, (code) => runtime.exit?.(code)),
        Effect.provide(NodeControl.layer({ ...configuration(options, runtime), startsRuns: true }))
      ),
      options,
      runtime
    ),
    runtime
  )

/**
 * Runs a read-only verb over the project's existing stores.
 *
 * Nothing is created, migrated, recovered or reaped, and the reads answer
 * while another process holds the writer. Only a verb that changes nothing
 * belongs here; one that cancels, signals or decides goes through
 * {@link query} or {@link launch}.
 * @category constructors
 * @since 1.0.0
 */
export const read = async <A, E>(
  operation: Effect.Effect<A, E, Control.Control | Ui.Ui>,
  options: ConnectionOptions,
  runtime: Runtime = {}
): Promise<A> =>
  settle(
    provideServices(
      operation.pipe(Effect.provide(NodeControl.layerObserve(configuration(options, runtime)))),
      options,
      runtime
    ),
    runtime
  )

/**
 * Runs a typed verb on the project alone, without opening the control host or
 * building the flow registry. The project references are the host's.
 * @category constructors
 * @since 1.0.0
 */
export const project = async <A, E>(
  operation: Effect.Effect<A, E, Ui.Ui>,
  options: ConnectionOptions,
  runtime: Runtime = {}
): Promise<A> => {
  const config = configuration(options, runtime)
  const root = config.root ?? process.cwd()
  return settle(
    provideServices(
      operation.pipe(
        Effect.provide([
          Project.layer(root, config.migrationRoot ?? Project.legacyRoot(undefined, root)),
          NodeServices.layer
        ])
      ),
      options,
      runtime
    ),
    runtime
  )
}

/**
 * Runs a typed verb on the project alone, without opening the control host:
 * the 0.x migration, garbage collection, and the registry check. The project
 * references and the flow registry are the host's.
 * @category constructors
 * @since 1.0.0
 */
export const local = <A, E>(
  operation: Effect.Effect<A, E, Registry.Registry | Ui.Ui>,
  options: ConnectionOptions,
  runtime: Runtime = {}
): Promise<A> =>
  project(
    operation.pipe(Effect.provide(NodeControl.layerRegistry(configuration(options, runtime).root ?? process.cwd()))),
    options,
    runtime
  )

/**
 * Serves the gateway and durable trigger scheduler on one shared local Control host.
 * @category constructors
 * @since 1.0.0
 */
export const host = async (bind: Serve.Bind, options: ConnectionOptions, runtime: Runtime = {}): Promise<void> => {
  const config = configuration(options, runtime)
  if (config.remote !== undefined) {
    throw new CliError.UnsupportedError({
      message: "serve must run on the host owning the project; --remote is not supported"
    })
  }
  const refusal = Serve.refuse(bind)
  if (refusal !== undefined) throw refusal
  // A gateway credential authenticates callers; only the host may delegate
  // approval authority. Do not inherit NodeControl's credential-based default.
  // A served gateway and the trigger scheduler beside it both launch runs, so
  // this host is a run-capable one and refuses to open without a judge.
  const operatorToken = bind.credential === undefined || bind.credential === ""
    ? randomBytes(32).toString("hex")
    : undefined
  const servedBind = { ...bind, operatorToken }
  const control = NodeControl.layer({
    ...config,
    startsRuns: true,
    approvalChannel: true,
    approvalAuthority: config.approvalAuthority ?? ApprovalAuthority.local
  })
  const root = Project.root(config.root, process.cwd())
  const host = Layer.merge(control, layerTriggerScheduler(root).pipe(Layer.provide(control)))
  if (!options.quiet) process.stderr.write(`${Serve.banner(servedBind)}\n`)
  if (operatorToken !== undefined) process.stderr.write(`  approval token  ${operatorToken}\n`)
  const result = await Effect.runPromiseExit(
    Serve.host(servedBind, root).pipe(
      Effect.provide(host),
      // The gateway's Run.Fork and Run.Verify, over this project's stores.
      Effect.provide(GatewayHistory.layer(root)),
      Effect.provide(RedactedLogger.layer()),
      Effect.provide(Telemetry.layer(runtime.environment ?? process.env)),
      Effect.provideService(Logger.LogToStderr, true)
    ),
    { signal: runtime.signal }
  )
  if (Exit.isFailure(result)) throw Cause.squash(result.cause)
}
