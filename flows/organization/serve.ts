/**
 * `serve --standalone`: runs an organization host in the foreground on a
 * loopback port, with its durable state in the state directory.
 *
 * Startup order: read and check the settings; reap the microVMs a dead host
 * process of this installation left behind; build the host; serve the
 * gateway; and, when both Slack tokens are set, run the Slack intake beside
 * it. Runs a previous process parked (an approval gate, a model call cut
 * short) resume from the engine database; Ctrl-C stops the process and leaves
 * them parked.
 */
import type * as SeatResolver from "@smthrs/agent/SeatResolver"
import { Control } from "@smthrs/control"
import { Effect } from "effect"
import { randomUUID } from "node:crypto"
import { hostname } from "node:os"
import * as SlackConfig from "../../packages/smithers/agent/integrations/src/slack/Config.ts"
import * as MicrosandboxSandbox from "../../packages/smithers/flows/sandbox/src/MicrosandboxSandbox/index.ts"
import type * as NativeControl from "../../packages/smithers/src/internal/NativeControl.ts"
import * as Serve from "../../packages/smithers/src/Serve.ts"
import type { Control as ControlPort } from "./client.ts"
import { ControlRefused } from "./client.ts"
import { layer } from "./host.ts"
import type { Settings } from "./settings.ts"
import * as SetupMicrosandbox from "./setup/microsandbox.ts"
import * as SlackIntake from "./slack.ts"

/** The host's own control plane as the {@link ControlPort} the Slack intake uses. */
export const inProcess = (control: Control.Control["Service"]): ControlPort => {
  const methods = {
    Plan: control.plan,
    Approve: control.approve,
    Run: control.run,
    List: control.list,
    Signal: control.signal
  } as const
  return {
    call: (tag, payload) => {
      const method = methods[tag] as (input: unknown) => Effect.Effect<unknown, { _tag: string; message: string }>
      return Effect.runPromise(
        method(payload).pipe(Effect.mapError((error) => new ControlRefused(error._tag, tag, error.message)))
      )
    }
  }
}

/** Whether a holder label names a live process on this machine. */
export const holderAlive = (holder: string): boolean => {
  const [host, pid] = holder.split(":")
  if (host !== hostname() || pid === undefined || !/^\d+$/.test(pid)) return host !== hostname()
  try {
    process.kill(Number(pid), 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

/** Options for {@link start}. */
export interface StartOptions {
  readonly settings: Settings
  readonly environment: Readonly<Record<string, string | undefined>>
  readonly platform: NativeControl.Platform
  /** An offline composition's seats; the environment's otherwise. */
  readonly seats?: SeatResolver.Service | undefined
  /** A fixture's plaintext Slack socket. */
  readonly allowPlaintextSocket?: boolean | undefined
  readonly log?: ((line: string) => void) | undefined
}

/** Starts a host and serves until interrupted. */
export const start = async (options: StartOptions) => {
  const { settings, environment } = options
  const log = options.log ?? ((line: string) => process.stderr.write(`${line}\n`))
  const install = SetupMicrosandbox.locate()
  if (install === undefined) throw new Error("the microsandbox SDK is not installed; run pnpm install")
  const sdk = await SetupMicrosandbox.sdkOf(install)
  sdk.setDefaultBackend("local")
  const holder = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`
  const reaped = await Effect.runPromise(MicrosandboxSandbox.reap({
    sdk,
    owner: settings.installation,
    isAlive: (label) => Effect.succeed(holderAlive(label))
  }))
  if (reaped.length > 0) log(`reaped ${reaped.length} machine(s) a stopped host left behind`)
  const slack = (environment.SMITHERS_SLACK_BOT_TOKEN ?? "") !== "" && (environment.SMITHERS_SLACK_APP_TOKEN ?? "") !== ""
  // Refuses a policy that admits nobody before anything opens.
  const policy = slack ? SlackConfig.policy(environment) : undefined
  const bind: Serve.Bind = { host: settings.host, port: settings.port, listen: false, credential: undefined }
  const refusal = Serve.refuse(bind)
  if (refusal !== undefined) throw refusal
  const program = Effect.gen(function*() {
    if (policy !== undefined) {
      const control = yield* Control.Control
      yield* Effect.forkScoped(SlackIntake.run({
        control: inProcess(control),
        policy,
        stateDir: settings.stateDir,
        environment,
        allowPlaintextSocket: options.allowPlaintextSocket
      }).pipe(Effect.catchCause((cause) => Effect.logError("organization Slack intake stopped", cause))))
    }
    log(`organization host on http://${settings.host}:${settings.port} (state ${settings.stateDir}; Slack ${slack ? "on" : "off"})`)
    return yield* Serve.host(bind, settings.root)
  }).pipe(
    Effect.scoped,
    Effect.provide(layer(options.platform, { settings, sdk, holder, slack, environment }, options.seats))
  )
  return program
}
