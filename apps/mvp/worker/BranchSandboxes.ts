import { GitProxy } from "@smthrs/effect-code-storage"
import { Logger } from "@smthrs/observability"
import { ContainerSession, ContainerTerminal, SandboxObject as SandboxHost } from "@smthrs/platform-cloudflare"
import { SandboxTools } from "@smthrs/sandbox"
import { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { Cause, Config, Effect, Fiber, Layer, Schema, Scope } from "effect"
import { FetchHttpClient, Headers, HttpBody, HttpServerRequest, HttpServerResponse } from "effect/http"
import * as Database from "../db/Database.ts"
import { BranchSandbox } from "../infra/BranchSandbox.ts"
import { ROLES } from "../src/features/auth/contract.ts"
import { FORGE_HOST, SANDBOX_USER, WORKSPACE } from "../src/features/terminal/contract.ts"
import type { Role } from "./Actor.ts"
import { canEdit, canView, type Policy, underPolicy } from "./branch/Access.ts"
import { CHECKOUT_FAILURES, checkoutArgv, forgeRemote } from "./branch/Checkout.ts"
import * as Machine from "./branch/Machine.ts"
import { Machines, type SleepOutcome, type ToolOutcome } from "./branch/Machines.ts"
import { envOf, idOf, provisionArgv, userOf } from "./branch/Users.ts"
import { Forge, forgeOf } from "./branch/Forge.ts"
import {
  type Attachment,
  CheckoutFailed,
  type Revoked,
  SandboxBranch,
  Sandboxes,
  SandboxStartTimedOut,
  SandboxUnavailable,
  TerminalSockets,
} from "./branch/Sandboxes.ts"
import { codeOf } from "./ErrorCode.ts"
import { SecretKeys } from "./secrets/Keys.ts"
import * as SandboxEgress from "./secrets/SandboxEgress.ts"

// Branch sandboxes on Cloudflare (decision 0013 §3, decision 0005 §2, docs/features/branch-workspace.md#the-machine):
// `SandboxObject`, one Durable Object per branch, named by the branch's id, owns that branch's container
// (infra/BranchSandbox.ts). It wakes the box, checks the branch out, starts terminal sessions, attaches sockets to them,
// and is the box's forge: the box's only way out is `http://forge.smithers.internal`, whose requests the container
// sends to ChatApi's own entrypoint (`ctx.exports.default` with `props` naming the object, Cloudflare's documented
// intercept target; a Durable Object's stub is not one, and in production a box's requests never reached it). ChatApi
// hands each back to the object (`answerBox`), which answers it with the read-only git proxy, adding the read
// credential the box never holds. ChatApi hosts it; the flows and
// routes reach it through `Sandboxes` and `TerminalSockets`, and the sandbox tools through `Machines`
// (docs/features/sandbox-tools.md), which this file provides from its namespace.

/** The headers only ChatApi sets on a socket it hands the object; it strips any a browser sent (worker/branch/Terminals.ts). */
const TERMINAL_HEADER = "x-smithers-terminal"
const ACCESS_HEADER = "x-smithers-access"
const OWNER_HEADER = "x-smithers-owner"
const PRINCIPAL_HEADER = "x-smithers-principal"
const ROLE_HEADER = "x-smithers-role"
/**
 * The one-use ticket ChatApi takes from the object (`ticket`) for each socket it hands it. With the egress on, the box's
 * own requests reach the object's `fetch` too, for any host; only ChatApi, which holds the namespace, can get a ticket,
 * so the box can never attach to a terminal.
 */
const TICKET_HEADER = "x-smithers-ticket"

/**
 * `SANDBOX_SECRETS`: whether the box's outbound HTTP and HTTPS reach the secrets egress (worker/secrets/SandboxEgress.ts,
 * docs/features/secrets.md#the-egress), and the box gets its placeholders. Off unless set: it stays off until an e2e
 * proves a box gets a bound host's answer and never sees a value.
 */
export const sandboxSecrets = Config.Boolean("SANDBOX_SECRETS").pipe(Config.withDefault(false))

/**
 * `SANDBOX_INSTANCE`: the instance type a branch's machine starts on (decision 0013 §9), `standard-1` unless set: 1/2
 * vCPU, 4 GiB of memory and 8 GB of disk. Cloudflare's own default, `lite`, has 256 MiB, too little for a real
 * repository's clone and tests.
 */
export const sandboxInstance = Config.schema(
  Schema.Literals(["lite", "basic", "standard-1", "standard-2", "standard-3", "standard-4"]),
  "SANDBOX_INSTANCE",
).pipe(Config.withDefault("standard-1" as const))

/**
 * `SANDBOX_START_TIMEOUT_SECONDS`: the longest a stopped machine's container may take to start before its wake fails
 * `start_timeout`, 150 seconds unless set: a typed failure a call or a terminal settles on, where an unbounded start
 * (312 s seen) kept a call `running` until the browser gave up.
 */
export const sandboxStartTimeoutSeconds = Config.schema(
  Schema.Int.check(Schema.isGreaterThan(0)),
  "SANDBOX_START_TIMEOUT_SECONDS",
).pipe(Config.withDefault(150))

/** Where Cloudflare puts the container's per-instance CA, which signs the HTTPS the egress decrypts. */
export const CONTAINER_CA = "/etc/cloudflare/certs/cloudflare-containers-ca.crt"

/**
 * Run as root on a wake with the egress on: the box's environment file from stdin, readable by every user and sourced
 * by every login shell (tmux starts one), and the container's CA trusted system-wide when Cloudflare provides it.
 */
const EGRESS_SETUP = `umask 022
mkdir -p /run/smithers && cat >/run/smithers/env.tmp && mv -f /run/smithers/env.tmp /run/smithers/env || exit 1
if [ -f ${CONTAINER_CA} ]; then
  echo "NODE_EXTRA_CA_CERTS=${CONTAINER_CA}" >>/run/smithers/env
  cp ${CONTAINER_CA} /usr/local/share/ca-certificates/cloudflare-containers-ca.crt && update-ca-certificates >/dev/null 2>&1
fi
printf '%s\n' '[ -r /run/smithers/env ] && { set -a; . /run/smithers/env; set +a; }' >/etc/profile.d/smithers-env.sh`

/**
 * What a log line says about a failure: its code (`codeOf`, of the failure itself, not its cause) and, for an error with
 * no tag, its class name, such as `TypeError`. Never its message.
 */
const failureFields = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause)
  return { errorCode: codeOf(error), errorName: error instanceof Error ? error.name : typeof error }
}

/** Whether a wake failed because the container didn't finish starting in time (`SANDBOX_START_TIMEOUT_SECONDS`). */
const startTimedOut = (cause: Cause.Cause<unknown>) => Cause.squash(cause) instanceof SandboxHost.StartTimedOut

/** The step of a wake a failure happened in, as its `sandbox.wake` log line names it. */
type WakeStage = "start" | "checkout" | "restore" | "placeholders"

/**
 * How a command runs as the machine's user `name`: its numeric `uid:gid` (a deployed container refuses a name) and the
 * variables `exec` doesn't give it (worker/branch/Users.ts). A name with no uid is a defect.
 */
const asUser = (name: string) => {
  const user = idOf(name)
  return user === undefined
    ? Effect.die(new Error("the machine has no uid for this user"))
    : Effect.succeed({ user, env: envOf(name) })
}

/** `NAME=value` lines as variables. */
const variablesOf = (environment: string): Record<string, string> =>
  Object.fromEntries(
    environment.split("\n").flatMap((line) => {
      const at = line.indexOf("=")
      return at > 0 ? [[line.slice(0, at), line.slice(at + 1)]] : []
    }),
  )

/** A role as its header carries it: one of the roles, else none. */
const roleOf = (value: string | undefined): Role | null =>
  (ROLES as ReadonlyArray<string>).includes(value ?? "") ? (value as Role) : null

/**
 * The `ctx.props` key of ChatApi's own entrypoint that marks a request a branch's box sent, naming its object by id.
 * Only this Worker's own code can set `props` (`ctx.exports`); a request from anywhere else has none.
 */
export const BOX_PROP = "sandboxObject"

/** The id of the object whose box sent the request with these `props`; nothing for any other request. */
export const boxOf = (props: unknown): string | undefined => {
  const value = typeof props === "object" && props !== null ? (props as Record<string, unknown>)[BOX_PROP] : undefined
  return typeof value === "string" && value !== "" ? value : undefined
}

/** The loopback to ChatApi's own default entrypoint a Durable Object's `ctx.exports` holds, with `props`. */
interface Loopback {
  readonly exports: { readonly default: (options: { readonly props: Record<string, string> }) => Fetcher }
}

/** What `wake` answers: the machine's generation, or why it couldn't wake. */
export type Woken =
  | { readonly _tag: "Woken"; readonly generation: number }
  | { readonly _tag: "Unavailable"; readonly reason?: "start_timeout" }
  | { readonly _tag: "CheckoutFailed" }

/** The object's methods, as ChatApi and the flow host call them. */
export interface SandboxObjectShape {
  readonly wake: (branch: SandboxBranch) => Effect.Effect<Woken, never, RuntimeContext>
  readonly session: (terminalId: string, ownerId: string) => Effect.Effect<boolean, never, RuntimeContext>
  readonly alive: (terminalId: string, ownerId: string) => Effect.Effect<boolean, never, RuntimeContext>
  readonly enforce: (policy: Policy, revoked: ReadonlyArray<Revoked>) => Effect.Effect<void, never, RuntimeContext>
  readonly tool: (
    branch: SandboxBranch,
    ownerId: string,
    callId: string,
    call: SandboxTools.Call,
  ) => Effect.Effect<ToolOutcome, never, RuntimeContext>
  readonly sleepIfIdle: (
    generation: number,
    idleMs: number,
  ) => Effect.Effect<SleepOutcome | "unavailable", never, RuntimeContext>
  readonly ticket: () => Effect.Effect<string, never, RuntimeContext>
}

/** The `SandboxObject` Durable Object namespace: a branch's object is `getByName(branchId)`. */
export class SandboxObject extends Cloudflare.DurableObject<SandboxObject, SandboxObjectShape>()("SandboxObject") {}

const isBranch = Schema.is(SandboxBranch)

/**
 * The object's implementation: the branch's container, its checkout, its terminals, its forge and, with
 * `SANDBOX_SECRETS` on, its egress, which reaches Postgres through `connection`, the Hyperdrive config ChatApi binds.
 */
export const live = <E, R>(connection: Effect.Effect<Cloudflare.Hyperdrive.Connection, E, R>) => SandboxObject.make(
  Effect.gen(function* () {
    const box = yield* BranchSandbox
    const state = yield* Cloudflare.DurableObjectState
    const forge = yield* Effect.service(Forge).pipe(Effect.provide(Forge.layerConfig), Effect.provide(FetchHttpClient.layer))
    const secretsOn = yield* sandboxSecrets.pipe(Effect.orDie)
    const instance = yield* sandboxInstance.pipe(Effect.orDie)
    const startTimeoutMs = (yield* sandboxStartTimeoutSeconds.pipe(Effect.orDie)) * 1000
    const secretKeys = yield* Effect.service(SecretKeys).pipe(Effect.provide(SecretKeys.layerConfig), Effect.orDie)
    const hyperdrive = yield* Cloudflare.Hyperdrive.Connect(connection)
    const database = Database.layer(hyperdrive.connectionString)
    // Workers Logs keeps every JSON line, as it does ChatApi's and FlowExecution's. Without it this object's lines
    // (`sandbox.wake`, `sandbox.checkout`, `sandbox.forge`) never reached a log or a tail.
    const logs = Logger.layerStructuredJson()
    const logged = <A, E, RE>(effect: Effect.Effect<A, E, RE>) => Effect.provide(effect, logs)
    return Effect.gen(function* () {
      // This incarnation's own scope: each socket's pump runs in it for as long as its socket is open, and the object
      // stays in memory while an accepted socket is (no hibernation, which would drop the tmux client's handle).
      const pumps = yield* Scope.make()
      /** Re-arms a running box's inactivity timeout; its failure is logged (`cloudflare.sandbox.rearm`) and ignored. */
      const rearm = Effect.ignore(SandboxHost.rearm(box))
      // A restarted object has no inactivity timeout, and Cloudflare stops its container soon after it goes idle, even
      // while a process runs: re-arm it now, in the constructor, as Cloudflare's docs say (`SandboxHost.rearm`).
      yield* logged(rearm)
      // Every socket attached now, with who attached it, so a change of the branch's sharing reaches it (`enforce`).
      const attached = new Map<
        WebSocket,
        {
          readonly principal: string
          readonly role: Role | null
          readonly access: "write" | "read"
          readonly fiber: Fiber.Fiber<unknown>
        }
      >()
      // The box's forge requests go to ChatApi's own entrypoint with props naming this object, and come back to it
      // (`answerBox`), which answers them as the forge proxy; with the egress on, every other request it makes does
      // too, and the object answers it as the secrets egress.
      const own = Cloudflare.fromCloudflareFetcher(
        (state.raw as unknown as Loopback).exports.default({ props: { [BOX_PROP]: state.id.toString() } }),
      )
      const intercepts = [{ host: FORGE_HOST, fetcher: own }]
      const egressTo = secretsOn ? own : undefined
      // One-use tickets ChatApi took for the sockets it is about to hand this object (TICKET_HEADER).
      const tickets = new Set<string>()
      const branchOf = state.storage.get<SandboxBranch>("branch").pipe(
        Effect.map((value) => (value !== undefined && isBranch(value) ? value : undefined)),
      )

      /** Starts the box unless it runs, and advances the generation when it started it. */
      const start = Effect.gen(function* () {
        const outcome = yield* SandboxHost.wake(box, { intercepts, egress: egressTo, instance, startTimeoutMs })
        const generation = (yield* state.storage.get<number>("generation")) ?? 0
        if (outcome === "running" && generation > 0) return generation
        yield* state.storage.put("generation", generation + 1)
        return generation + 1
      })

      /** Runs `argv` as the machine's user `name`, answering its exit code. */
      const run = (argv: Array<string>, name: string) =>
        Effect.flatMap(asUser(name), (options) =>
          Effect.scoped(Effect.flatMap(box.exec(argv, options), (process) => process.exitCode)))

      // A wake's failure is logged with the step it failed in: the container's start, the checkout, the restore or
      // the placeholders, so a failure only production shows says where it happened.
      const wake = (branch: SandboxBranch) =>
        Effect.suspend(() => {
          let stage: WakeStage = "start"
          return Effect.gen(function* () {
            yield* state.storage.put("branch", branch)
            const generation = yield* start
            stage = "checkout"
            const exit = yield* run(checkoutArgv(branch.branch, forgeRemote(branch.owner, branch.name)), SANDBOX_USER)
            if (exit !== 0) {
              yield* Effect.logWarning("sandbox.checkout").pipe(
                Effect.annotateLogs({ branchId: branch.branchId, exitCode: exit, failure: CHECKOUT_FAILURES[exit] ?? "other" }),
              )
              return { _tag: "CheckoutFailed" } as const
            }
            // A fresh generation gets the working copy the last one saved (worker/branch/Machine.ts); once. A machine
            // that doesn't answer fails the wake, which is tried again, before anything can save over the checkpoint.
            stage = "restore"
            yield* Machine.restore(machine, generation)
            stage = "placeholders"
            if (secretsOn) yield* placeholders(branch, generation)
            return { _tag: "Woken", generation } as const
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.as(
                Effect.logWarning("sandbox.wake").pipe(
                  Effect.annotateLogs({ branchId: branch.branchId, stage, ...failureFields(cause) }),
                ),
                startTimedOut(cause) ? { _tag: "Unavailable", reason: "start_timeout" } as const : { _tag: "Unavailable" } as const,
              )
            ),
          )
        }).pipe(Effect.withSpan("sandbox.object.wake", { attributes: { "smithers.branch.id": branch.branchId } }))

      /** The guest the box is: its repository's branch at the running generation, from this object's own state. */
      const guestOf = (branch: SandboxBranch, generation: number): SandboxEgress.Guest => ({
        repoId: `github/${branch.owner}/${branch.name}`,
        branchId: branch.branchId,
        generation,
      })

      /**
       * With the egress on, every wake writes the generation's placeholders to /run/smithers/env and trusts the
       * container's CA (EGRESS_SETUP), and the object keeps them for the tools' commands. Values never enter the box.
       */
      const placeholders = (branch: SandboxBranch, generation: number) =>
        Effect.gen(function* () {
          const environment = yield* SandboxEgress.environment(guestOf(branch, generation)).pipe(
            Effect.provideService(SecretKeys, secretKeys),
            Effect.provide(database),
          )
          yield* state.storage.put("environment", { generation, environment })
          const root = yield* ContainerSession.make(box, { id: state.id.toString(), workdir: "/", ...(yield* asUser("root")) })
          const code = yield* Effect.scoped(Effect.flatMap(
            root.spawn(EGRESS_SETUP, { stdin: new TextEncoder().encode(environment) }),
            (process) => process.exitCode,
          ))
          if (code !== 0) yield* Effect.logWarning("sandbox.egress.setup").pipe(Effect.annotateLogs({ exitCode: code }))
        }).pipe(
          // The box stays usable without its placeholders: its requests that need one are refused at the egress.
          Effect.catchCause((cause) =>
            Effect.logWarning("sandbox.egress.setup").pipe(Effect.annotateLogs(failureFields(cause)))
          ),
          Effect.withSpan("sandbox.egress.setup", { attributes: { "smithers.branch.id": branch.branchId } }),
        )

      /** The placeholders of the running generation, for a tool's command; none with the egress off. */
      const environmentNow = Effect.gen(function* () {
        if (!secretsOn) return {}
        const kept = yield* state.storage.get<{ readonly generation: number; readonly environment: string }>("environment")
        const generation = yield* state.storage.get<number>("generation")
        return kept !== undefined && kept.generation === generation ? variablesOf(kept.environment) : {}
      })

      // The machine as its tools and lifecycle use it (worker/branch/Machine.ts, docs/features/sandbox-tools.md).
      const machine: Machine.Box<RuntimeContext> = {
        sessionAs: (name) =>
          Effect.gen(function* () {
            const placeholders = yield* environmentNow
            const { env, user } = yield* asUser(name)
            return yield* ContainerSession.make(box, {
              id: state.id.toString(),
              workdir: WORKSPACE,
              user,
              env: { ...placeholders, ...env },
            })
          }),
        run,
        running: box.running,
        destroy: box.destroy(),
        storage: {
          get: (key) => state.storage.get(key),
          put: (key, value) => state.storage.put(key, value),
          delete: (key) => state.storage.delete(key),
          list: (prefix) => state.storage.list({ prefix }),
        },
      }

      /** Saves the running generation's working copy, as a terminal comes or goes; nothing when the box is stopped. */
      const saveNow = Effect.gen(function* () {
        yield* Machine.touch(machine)
        const generation = yield* state.storage.get<number>("generation")
        if (generation === undefined || !(yield* box.running)) return
        yield* Machine.save(machine, generation)
      }).pipe(Effect.ignore)

      /** Runs one sandbox tool on the branch's machine, waking it first (worker/branch/Machine.ts). */
      const tool = (branch: SandboxBranch, ownerId: string, callId: string, call: SandboxTools.Call) =>
        Effect.gen(function* () {
          const woken = yield* wake(branch)
          if (woken._tag !== "Woken") return woken
          return yield* Machine.tool(machine, { ownerId, callId, call, generation: woken.generation })
        })

      // Each ask re-arms the inactivity timeout first, so a box this object restarted under (a deploy) keeps its backstop
      // while `sandbox/Keep` decides.
      const sleepIfIdle = (generation: number, idleMs: number) =>
        Effect.andThen(rearm, Machine.sleepIfIdle(machine, generation, idleMs)).pipe(
          Effect.catchCause((cause) =>
            Effect.as(
              Effect.logWarning("sandbox.object.sleep").pipe(Effect.annotateLogs(failureFields(cause))),
              "unavailable" as const,
            )
          ),
        )

      // Each person's shell runs as their own user, made on first use (worker/branch/Users.ts). Opening one is use.
      const session = (terminalId: string, ownerId: string) =>
        Effect.gen(function* () {
          yield* start
          yield* Machine.touch(machine)
          const name = userOf(ownerId)
          if ((yield* run(provisionArgv(name), "root")) !== 0) return false
          const { env, user } = yield* asUser(name)
          yield* ContainerTerminal.ensureSession(box, { name: terminalId, user, cwd: WORKSPACE, env })
          return true
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.as(
              Effect.logWarning("sandbox.object.session").pipe(Effect.annotateLogs(failureFields(cause))),
              false,
            )
          ),
        )

      const alive = (terminalId: string, ownerId: string) =>
        Effect.gen(function* () {
          yield* rearm
          if (!ContainerTerminal.isSessionName(terminalId) || !(yield* box.running)) return false
          return (yield* run(["tmux", "has-session", "-t", `=${terminalId}`], userOf(ownerId))) === 0
        }).pipe(Effect.catchCause(() => Effect.succeed(false)))

      /** A socket ChatApi admitted: attached to the terminal's session for as long as it is open. */
      const attach = (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          const terminalId = request.headers[TERMINAL_HEADER] ?? ""
          const ownerId = request.headers[OWNER_HEADER] ?? ""
          const principal = request.headers[PRINCIPAL_HEADER] ?? ""
          const access = request.headers[ACCESS_HEADER] === "write" ? "write" : "read"
          if (!ContainerTerminal.isSessionName(terminalId) || ownerId === "" || principal === "") {
            return HttpServerResponse.empty({ status: 400 })
          }
          yield* rearm
          const { env, user } = yield* asUser(userOf(ownerId))
          const pair = new WebSocketPair()
          const [client, server] = [pair[0], pair[1]]
          server.accept()
          const fiber = yield* Effect.forkIn(
            ContainerTerminal.attach(box, server, { name: terminalId, user, access, cols: 80, rows: 24, env })
              .pipe(Effect.ensuring(Effect.sync(() => attached.delete(server))), Effect.ensuring(saveNow)),
            pumps,
          )
          attached.set(server, { principal, role: roleOf(request.headers[ROLE_HEADER]), access, fiber })
          return HttpServerResponse.setBody(
            HttpServerResponse.empty({ status: 101 }),
            HttpBody.raw(new Response(null, { status: 101, webSocket: client })),
          )
        })

      /**
       * A request from the box to any other host, with the egress on: the secrets egress, for the guest this object's
       * own state names, never the request.
       */
      const egressOut = Effect.gen(function* () {
        const branch = yield* branchOf
        const generation = yield* state.storage.get<number>("generation")
        if (branch === undefined || generation === undefined) return HttpServerResponse.empty({ status: 403 })
        return yield* SandboxEgress.forward(guestOf(branch, generation)).pipe(
          Effect.provideService(SecretKeys, secretKeys),
          Effect.provide(Layer.merge(database, FetchHttpClient.layer)),
        )
      })

      /**
       * A request from the box to its forge: the read-only git proxy, with the read credential added here. Each logs
       * `sandbox.forge` with its status, never its path or body.
       */
      const egress = (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          const branch = yield* branchOf
          if (branch === undefined) {
            yield* Effect.logWarning("sandbox.forge").pipe(Effect.annotateLogs({ status: 403, outcome: "no_branch" }))
            return HttpServerResponse.empty({ status: 403 })
          }
          const upstream = yield* forgeOf(forge, branch).upstream({ owner: branch.owner, name: branch.name })
          const response = yield* GitProxy.uploadPack(request, upstream).pipe(Effect.provide(FetchHttpClient.layer))
          yield* Effect.logInfo("sandbox.forge").pipe(
            Effect.annotateLogs({ branchId: branch.branchId, status: response.status, outcome: "answered" }),
          )
          return response
        }).pipe(
          Effect.tapCause((cause) =>
            Effect.logWarning("sandbox.forge").pipe(Effect.annotateLogs({ outcome: "failed", ...failureFields(cause) }))
          ),
        )

      /**
       * Holds every attached socket to the branch's permission list as it now stands: a viewer who lost the branch is
       * detached for good (1008), one whose access changed reconnects (1011) and attaches with the new one. Then each
       * revoked terminal's shell ends, which ends every socket still on it. Never starts the box.
       */
      const enforce = (policy: Policy, revoked: ReadonlyArray<Revoked>) =>
        Effect.gen(function* () {
          let detached = 0
          for (const [socket, viewer] of attached) {
            const now = underPolicy(policy, viewer.principal, viewer.role)
            const code = !canView(now) ? 1008 : (canEdit(now) ? "write" : "read") !== viewer.access ? 1011 : undefined
            if (code === undefined) continue
            attached.delete(socket)
            detached++
            yield* Effect.sync(() => socket.close(code, code === 1008 ? "no access" : "access changed")).pipe(Effect.ignore)
            yield* Fiber.interrupt(viewer.fiber)
          }
          yield* rearm
          if (revoked.length > 0 && (yield* box.running)) {
            for (const terminal of revoked) {
              if (!ContainerTerminal.isSessionName(terminal.terminalId)) continue
              yield* run(["tmux", "kill-session", "-t", `=${terminal.terminalId}`], userOf(terminal.ownerId)).pipe(
                Effect.ignore,
              )
            }
          }
          yield* Effect.logInfo("sandbox.enforce").pipe(
            Effect.annotateLogs({ detached, revoked: revoked.length, attached: attached.size }),
          )
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("sandbox.enforce").pipe(Effect.annotateLogs(failureFields(cause)))
          ),
          Effect.withSpan("sandbox.object.enforce"),
        )

      // Every method logs as JSON (`logs`).
      return {
        wake: (branch: SandboxBranch) => logged(wake(branch)),
        session: (terminalId: string, ownerId: string) => logged(session(terminalId, ownerId)),
        alive: (terminalId: string, ownerId: string) => logged(alive(terminalId, ownerId)),
        enforce: (policy: Policy, revoked: ReadonlyArray<Revoked>) => logged(enforce(policy, revoked)),
        tool: (branch: SandboxBranch, ownerId: string, callId: string, call: SandboxTools.Call) =>
          logged(tool(branch, ownerId, callId, call)),
        sleepIfIdle: (generation: number, idleMs: number) => logged(sleepIfIdle(generation, idleMs)),
        ticket: () =>
          Effect.sync(() => {
            const ticket = crypto.randomUUID()
            tickets.add(ticket)
            return ticket
          }),
        fetch: logged(Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const host = new URL(request.originalUrl).host
          if (host === FORGE_HOST) return yield* egress(request)
          // Only ChatApi holds a ticket: a socket it hands over is attached, once per ticket.
          if (tickets.delete(request.headers[TICKET_HEADER] ?? "")) return yield* attach(request)
          if (egressTo !== undefined) return yield* egressOut
          return HttpServerResponse.empty({ status: 404 })
        })),
      }
    })
  }),
)

/** The namespace as ChatApi and the flow host hold it once they have bound it (`yield* SandboxObject`). */
type Objects = Cloudflare.DurableObject<SandboxObjectShape>

/** Starts generation `generation`'s `sandbox/Keep` (worker/flows/SandboxKeep.ts); the same generation again is a no-op. */
export type Keep = (branchId: string, generation: number) => Effect.Effect<void, never, RuntimeContext>

const noKeep: Keep = () => Effect.void

/**
 * The flow host's `Sandboxes` over the bound namespace, for the runtime that calls it. Each wake starts its
 * generation's `sandbox/Keep` through `keep`.
 */
export const sandboxesOver = (objects: Objects, keep: Keep = noKeep) => Effect.gen(function* () {
  const runtime = yield* RuntimeContext
  return Sandboxes.of({
    wake: (branch) =>
      Effect.gen(function* () {
        const woken: Woken = yield* objects.getByName(branch.branchId).wake(branch).pipe(
          Effect.provideService(RuntimeContext, runtime),
          Effect.orElseSucceed((): Woken => ({ _tag: "Unavailable" })),
        )
        if (woken._tag === "CheckoutFailed") return yield* new CheckoutFailed()
        if (woken._tag === "Unavailable") return yield* new SandboxUnavailable({ reason: "start" })
        yield* keep(branch.branchId, woken.generation).pipe(Effect.provideService(RuntimeContext, runtime))
        return { generation: woken.generation }
      }),
    session: (branchId, terminalId, ownerId) =>
      objects.getByName(branchId).session(terminalId, ownerId).pipe(
        Effect.provideService(RuntimeContext, runtime),
        Effect.orElseSucceed(() => false),
        Effect.flatMap((started) => (started ? Effect.void : Effect.fail(new SandboxUnavailable({ reason: "exec" })))),
      ),
  })
})

/** ChatApi's `TerminalSockets` over the bound namespace, for the request that calls it. */
export const terminalSocketsOver = (objects: Objects) => Effect.gen(function* () {
  const runtime = yield* RuntimeContext
  return TerminalSockets.of({
    attach: (branchId: string, attachment: Attachment) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        // Only these two headers say who attaches; any `x-smithers-*` the browser sent is dropped first.
        const headers = Object.fromEntries(
          Object.entries(request.headers).filter(([name]) => !name.toLowerCase().startsWith("x-smithers-")),
        )
        const ticket = yield* objects.getByName(branchId).ticket().pipe(Effect.provideService(RuntimeContext, runtime))
        const forwarded = request.modify({
          headers: Headers.fromInput({
            ...headers,
            [TICKET_HEADER]: ticket,
            [TERMINAL_HEADER]: attachment.terminalId,
            [OWNER_HEADER]: attachment.ownerId,
            [ACCESS_HEADER]: attachment.access,
            [PRINCIPAL_HEADER]: attachment.principal,
            [ROLE_HEADER]: attachment.role ?? "",
          }),
        })
        return yield* objects.getByName(branchId).fetch(forwarded).pipe(Effect.provideService(RuntimeContext, runtime))
      }).pipe(Effect.orElseSucceed(() => HttpServerResponse.empty({ status: 503 }))),
    alive: (branchId, terminalId, ownerId) =>
      objects.getByName(branchId).alive(terminalId, ownerId).pipe(
        Effect.provideService(RuntimeContext, runtime),
        Effect.orElseSucceed(() => false),
      ),
    enforce: (branchId, policy, revoked) =>
      objects.getByName(branchId).enforce(policy, revoked).pipe(
        Effect.provideService(RuntimeContext, runtime),
        Effect.mapError(() => new SandboxUnavailable({ reason: "exec" })),
      ),
  })
})

/**
 * ChatApi's answer to a request a branch's box sent (`boxOf` its `props`): handed back to that box's own object, which
 * answers it as the box's forge, or with the egress on, as its secrets egress. 502 when the object can't be reached.
 */
export const answerBox = (objects: Objects, objectId: string) =>
  Effect.gen(function* () {
    const runtime = yield* RuntimeContext
    const request = yield* HttpServerRequest.HttpServerRequest
    return yield* objects.get(objects.idFromString(objectId)).fetch(request).pipe(
      Effect.provideService(RuntimeContext, runtime),
    )
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.as(
        Effect.logWarning("sandbox.box_request").pipe(Effect.annotateLogs(failureFields(cause))),
        HttpServerResponse.empty({ status: 502 }),
      )
    ),
  )

/** `Sandboxes` as a layer, built in the runtime that runs the flows (`RuntimeContext`). */
export const sandboxesLayer = (objects: Objects, keep: Keep = noKeep) =>
  Layer.effect(Sandboxes, sandboxesOver(objects, keep))

/**
 * The flow host's `Machines` over the bound namespace (docs/features/sandbox-tools.md): a tool call runs on the
 * branch's object, which wakes the machine; the generation it ran on gets its `sandbox/Keep` through `keep`.
 */
export const machinesOver = (objects: Objects, keep: Keep = noKeep) => Effect.gen(function* () {
  const runtime = yield* RuntimeContext
  return Machines.of({
    tool: (branch, ownerId, callId, call) =>
      Effect.gen(function* () {
        const outcome: ToolOutcome = yield* objects.getByName(branch.branchId).tool(branch, ownerId, callId, call).pipe(
          Effect.provideService(RuntimeContext, runtime),
          Effect.orElseSucceed((): ToolOutcome => ({ _tag: "Unavailable" })),
        )
        switch (outcome._tag) {
          case "Done":
            yield* keep(branch.branchId, outcome.generation).pipe(Effect.provideService(RuntimeContext, runtime))
            return { result: outcome.result, generation: outcome.generation }
          case "Refused":
            return yield* new SandboxTools.ToolRefused({ reason: outcome.reason })
          case "Lost":
            return yield* new SandboxTools.ToolLost()
          case "CheckoutFailed":
            return yield* new CheckoutFailed()
          case "Unavailable":
            return yield* outcome.reason === "start_timeout"
              ? new SandboxStartTimedOut()
              : new SandboxUnavailable({ reason: "exec" })
        }
      }),
    sleepIfIdle: (branchId, generation, idleMs) =>
      objects.getByName(branchId).sleepIfIdle(generation, idleMs).pipe(
        Effect.provideService(RuntimeContext, runtime),
        Effect.orElseSucceed(() => "unavailable" as const),
        Effect.flatMap((outcome) =>
          outcome === "unavailable" ? Effect.fail(new SandboxUnavailable({ reason: "exec" })) : Effect.succeed(outcome)
        ),
      ),
  })
})

/** `Machines` as a layer, built in the runtime that runs the flows (`RuntimeContext`). */
export const machinesLayer = (objects: Objects, keep: Keep = noKeep) => Layer.effect(Machines, machinesOver(objects, keep))
