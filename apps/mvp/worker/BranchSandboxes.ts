import { GitProxy } from "@smthrs/effect-code-storage"
import { ContainerTerminal, SandboxObject as SandboxHost } from "@smthrs/platform-cloudflare"
import { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { Effect, Layer, Schema, Scope } from "effect"
import { FetchHttpClient, Headers, HttpBody, HttpServerRequest, HttpServerResponse } from "effect/http"
import { BranchSandbox } from "../infra/BranchSandbox.ts"
import { FORGE_HOST, SANDBOX_USER, WORKSPACE } from "../src/features/terminal/contract.ts"
import { checkoutArgv, forgeRemote } from "./branch/Checkout.ts"
import { provisionArgv, userOf } from "./branch/Users.ts"
import { Forge } from "./branch/Forge.ts"
import {
  type Attachment,
  CheckoutFailed,
  SandboxBranch,
  Sandboxes,
  SandboxUnavailable,
  TerminalSockets,
} from "./branch/Sandboxes.ts"
import { codeOf } from "./ErrorCode.ts"

// Branch sandboxes on Cloudflare (decision 0013 §3, decision 0005 §2, docs/features/branch-workspace.md#the-machine):
// `SandboxObject`, one Durable Object per branch, named by the branch's id, owns that branch's container
// (infra/BranchSandbox.ts). It wakes the box, checks the branch out, starts terminal sessions, attaches sockets to them,
// and is the box's forge: the box's only way out is `http://forge.smithers.internal`, which the object intercepts and
// answers with the read-only git proxy, adding the read credential the box never holds. ChatApi hosts it; the flows and
// routes reach it through `Sandboxes` and `TerminalSockets`, which this file provides from its namespace.

/** The headers only ChatApi sets on a socket it hands the object; it strips any a browser sent (worker/branch/Terminals.ts). */
const TERMINAL_HEADER = "x-smithers-terminal"
const ACCESS_HEADER = "x-smithers-access"
const OWNER_HEADER = "x-smithers-owner"

/** What `wake` answers: the machine's generation, or why it couldn't wake. */
export type Woken =
  | { readonly _tag: "Woken"; readonly generation: number }
  | { readonly _tag: "Unavailable" }
  | { readonly _tag: "CheckoutFailed" }

/** The object's methods, as ChatApi and the flow host call them. */
export interface SandboxObjectShape {
  readonly wake: (branch: SandboxBranch) => Effect.Effect<Woken, never, RuntimeContext>
  readonly session: (terminalId: string, ownerId: string) => Effect.Effect<boolean, never, RuntimeContext>
  readonly alive: (terminalId: string, ownerId: string) => Effect.Effect<boolean, never, RuntimeContext>
}

/** The `SandboxObject` Durable Object namespace: a branch's object is `getByName(branchId)`. */
export class SandboxObject extends Cloudflare.DurableObject<SandboxObject, SandboxObjectShape>()("SandboxObject") {}

const isBranch = Schema.is(SandboxBranch)

/** The object's implementation: the branch's container, its checkout, its terminals and its forge. */
export const live = SandboxObject.make(
  Effect.gen(function* () {
    const box = yield* BranchSandbox
    const state = yield* Cloudflare.DurableObjectState
    const self = (yield* Cloudflare.DurableObject) as Cloudflare.DurableObject<SandboxObjectShape>
    const forge = yield* Effect.service(Forge).pipe(Effect.provide(Forge.layerConfig), Effect.provide(FetchHttpClient.layer))
    return Effect.gen(function* () {
      // This incarnation's own scope: each socket's pump runs in it for as long as its socket is open, and the object
      // stays in memory while an accepted socket is (no hibernation, which would drop the tmux client's handle).
      const pumps = yield* Scope.make()
      // The box's forge requests come back to this very object, which answers them as the forge proxy.
      const intercepts = [{ host: FORGE_HOST, fetcher: self.get(state.id) as unknown as Cloudflare.Fetcher }]
      const branchOf = state.storage.get<SandboxBranch>("branch").pipe(
        Effect.map((value) => (value !== undefined && isBranch(value) ? value : undefined)),
      )

      /** Starts the box unless it runs, and advances the generation when it started it. */
      const start = Effect.gen(function* () {
        const outcome = yield* SandboxHost.wake(box, { intercepts })
        const generation = (yield* state.storage.get<number>("generation")) ?? 0
        if (outcome === "running" && generation > 0) return generation
        yield* state.storage.put("generation", generation + 1)
        return generation + 1
      })

      const wake = (branch: SandboxBranch) =>
        Effect.gen(function* () {
          yield* state.storage.put("branch", branch)
          const generation = yield* start
          const exit = yield* Effect.scoped(
            Effect.flatMap(
              box.exec(checkoutArgv(branch.branch, forgeRemote(branch.owner, branch.name)), { user: SANDBOX_USER }),
              (process) => process.exitCode,
            ),
          )
          if (exit !== 0) {
            yield* Effect.logWarning("sandbox.checkout").pipe(
              Effect.annotateLogs({ branchId: branch.branchId, exitCode: exit }),
            )
            return { _tag: "CheckoutFailed" } as const
          }
          return { _tag: "Woken", generation } as const
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.as(
              Effect.logWarning("sandbox.wake").pipe(Effect.annotateLogs({ errorCode: codeOf(cause) })),
              { _tag: "Unavailable" } as const,
            )
          ),
          Effect.withSpan("sandbox.object.wake", { attributes: { "smithers.branch.id": branch.branchId } }),
        )

      /** Runs `argv` as `user`, answering its exit code. */
      const run = (argv: Array<string>, user: string) =>
        Effect.scoped(Effect.flatMap(box.exec(argv, { user }), (process) => process.exitCode))

      // Each person's shell runs as their own user, made on first use (worker/branch/Users.ts).
      const session = (terminalId: string, ownerId: string) =>
        Effect.gen(function* () {
          yield* start
          const user = userOf(ownerId)
          if ((yield* run(provisionArgv(user), "root")) !== 0) return false
          yield* ContainerTerminal.ensureSession(box, { name: terminalId, user, cwd: WORKSPACE })
          return true
        }).pipe(Effect.catchCause(() => Effect.succeed(false)))

      const alive = (terminalId: string, ownerId: string) =>
        Effect.gen(function* () {
          if (!ContainerTerminal.isSessionName(terminalId) || !(yield* box.running)) return false
          return (yield* run(["tmux", "has-session", "-t", `=${terminalId}`], userOf(ownerId))) === 0
        }).pipe(Effect.catchCause(() => Effect.succeed(false)))

      /** A socket ChatApi admitted: attached to the terminal's session for as long as it is open. */
      const attach = (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          const terminalId = request.headers[TERMINAL_HEADER] ?? ""
          const ownerId = request.headers[OWNER_HEADER] ?? ""
          const access = request.headers[ACCESS_HEADER] === "write" ? "write" : "read"
          if (!ContainerTerminal.isSessionName(terminalId) || ownerId === "") {
            return HttpServerResponse.empty({ status: 400 })
          }
          const pair = new WebSocketPair()
          const [client, server] = [pair[0], pair[1]]
          server.accept()
          yield* Effect.forkIn(
            ContainerTerminal.attach(box, server, { name: terminalId, user: userOf(ownerId), access, cols: 80, rows: 24 }),
            pumps,
          )
          return HttpServerResponse.setBody(
            HttpServerResponse.empty({ status: 101 }),
            HttpBody.raw(new Response(null, { status: 101, webSocket: client })),
          )
        })

      /** A request from the box to its forge: the read-only git proxy, with the read credential added here. */
      const egress = (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          const branch = yield* branchOf
          if (branch === undefined) return HttpServerResponse.empty({ status: 403 })
          const upstream = yield* forge.upstream({ owner: branch.owner, name: branch.name })
          return yield* GitProxy.uploadPack(request, upstream).pipe(Effect.provide(FetchHttpClient.layer))
        })

      return {
        wake,
        session,
        alive,
        fetch: Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const host = new URL(request.originalUrl).host
          if (host === FORGE_HOST) return yield* egress(request)
          if (request.headers[TERMINAL_HEADER] !== undefined) return yield* attach(request)
          return HttpServerResponse.empty({ status: 404 })
        }),
      }
    })
  }),
)

/** The namespace as ChatApi and the flow host hold it once they have bound it (`yield* SandboxObject`). */
type Objects = Cloudflare.DurableObject<SandboxObjectShape>

/** The flow host's `Sandboxes` over the bound namespace, for the runtime that calls it. */
export const sandboxesOver = (objects: Objects) => Effect.gen(function* () {
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
        const forwarded = request.modify({
          headers: Headers.fromInput({
            ...headers,
            [TERMINAL_HEADER]: attachment.terminalId,
            [OWNER_HEADER]: attachment.ownerId,
            [ACCESS_HEADER]: attachment.access,
          }),
        })
        return yield* objects.getByName(branchId).fetch(forwarded).pipe(Effect.provideService(RuntimeContext, runtime))
      }).pipe(Effect.orElseSucceed(() => HttpServerResponse.empty({ status: 503 }))),
    alive: (branchId, terminalId, ownerId) =>
      objects.getByName(branchId).alive(terminalId, ownerId).pipe(
        Effect.provideService(RuntimeContext, runtime),
        Effect.orElseSucceed(() => false),
      ),
  })
})

/** `Sandboxes` as a layer, built in the runtime that runs the flows (`RuntimeContext`). */
export const sandboxesLayer = (objects: Objects) => Layer.effect(Sandboxes, sandboxesOver(objects))
