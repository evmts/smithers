import { PresenceProtocol, PresenceRoom } from "@smthrs/sync"
import { RuntimeContext } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { Effect, Layer, Schema } from "effect"
import { Headers, HttpServerRequest, HttpServerResponse } from "effect/http"
import { ACCESSES } from "../src/features/branch/contract.ts"
import { ROLES } from "../src/features/auth/contract.ts"
import { canEdit, canView, type Policy, underPolicy } from "./branch/Access.ts"
import { type Member, RoomUnavailable, Rooms } from "./branch/Rooms.ts"
import { codeOf } from "./ErrorCode.ts"

// Branch rooms on Cloudflare (decision 0013 §4 and §10, docs/features/branch-workspace.md#presence): `RoomObject`, one
// Durable Object per branch, named by the branch's id, holds the sockets of everyone on the branch and tells each of
// them who else is there and where (`@smthrs/sync`'s `PresenceRoom`). It hibernates: an idle room bills no duration,
// keeps every connection in its socket's attachment, and stores nothing, so it never pins the branch's machine. ChatApi
// hosts it, joins each socket it admitted (worker/branch/Presence.ts), and reaches it through `Rooms`, which this file
// provides from its namespace.

/** The headers only ChatApi sets on a socket it hands the object; it strips any a browser sent. */
const PRINCIPAL_HEADER = "x-smithers-principal"
const NAME_HEADER = "x-smithers-name"
const ROLE_HEADER = "x-smithers-role"
const ACCESS_HEADER = "x-smithers-access"

/** What the room keeps of a member for itself, never sent to anyone: their role and access when they joined. */
const Kept = Schema.fromJsonString(Schema.Struct({
  role: Schema.NullOr(Schema.Literals(ROLES)),
  access: Schema.Literals(ACCESSES),
}))
const encodeKept = Schema.encodeSync(Kept)
const decodeKept = Schema.decodeUnknownOption(Kept)

/** The object's methods, as ChatApi calls them. */
export interface RoomObjectShape {
  readonly enforce: (policy: Policy) => Effect.Effect<void, never, RuntimeContext>
}

/** The `RoomObject` Durable Object namespace: a branch's room is `getByName(branchId)`. */
export class RoomObject extends Cloudflare.DurableObject<RoomObject, RoomObjectShape>()("RoomObject") {}

/** The object's implementation: the room of one branch. */
export const live = RoomObject.make(
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState
    return Effect.gen(function* () {
      // The socket handlers run outside a request, with this incarnation's runtime.
      const runtime = yield* RuntimeContext
      const host = { sockets: state.getWebSockets().pipe(Effect.provideService(RuntimeContext, runtime)) }

      /** A socket ChatApi admitted: joined to the room as the member its headers name. */
      const join = Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const principal = request.headers[PRINCIPAL_HEADER] ?? ""
        const name = request.headers[NAME_HEADER] ?? ""
        const kept = decodeKept(JSON.stringify({
          role: request.headers[ROLE_HEADER] === "" ? null : request.headers[ROLE_HEADER],
          access: request.headers[ACCESS_HEADER],
        }))
        if (principal === "" || name === "" || kept._tag === "None") return HttpServerResponse.empty({ status: 400 })
        const [response, socket] = yield* Cloudflare.upgrade()
        yield* PresenceRoom.join(host, socket, {
          principal,
          name,
          access: canEdit(kept.value.access) ? "write" : "read",
          data: encodeKept(kept.value),
        })
        return response
      })

      /**
       * Holds everyone in the room to the branch's permission list as it now stands: a member who lost the branch
       * leaves for good, and one whose access changed reconnects to get the new one.
       */
      const enforce = (policy: Policy) =>
        Effect.gen(function* () {
          let closed = 0
          for (const connection of yield* PresenceRoom.connections(host)) {
            const kept = decodeKept(connection.data)
            const was = kept._tag === "Some" ? kept.value : undefined
            const now = underPolicy(policy, connection.participant.principal, was?.role ?? null)
            const code = !canView(now)
              ? PresenceProtocol.CloseCode.noAccess
              : now !== was?.access
              ? PresenceProtocol.CloseCode.changed
              : undefined
            if (code === undefined) continue
            closed++
            yield* PresenceRoom.close(host, connection.socket, code)
          }
          yield* Effect.logInfo("room.enforce").pipe(Effect.annotateLogs({ closed }))
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("room.enforce").pipe(Effect.annotateLogs({ errorCode: codeOf(cause) }))
          ),
          Effect.withSpan("room.object.enforce"),
        )

      return {
        enforce,
        fetch: join,
        webSocketMessage: (socket: Cloudflare.WebSocket, message: string | ArrayBuffer) =>
          PresenceRoom.receive(host, socket, message),
        webSocketClose: (socket: Cloudflare.WebSocket) => PresenceRoom.leave(host, socket),
        webSocketError: (socket: Cloudflare.WebSocket) => PresenceRoom.leave(host, socket),
      }
    })
  }),
)

/** The namespace as ChatApi holds it once it has bound it (`yield* RoomObject`). */
type Objects = Cloudflare.DurableObject<RoomObjectShape>

/** ChatApi's `Rooms` over the bound namespace, for the request that calls it. */
export const roomsOver = (objects: Objects) =>
  Effect.gen(function* () {
    const runtime = yield* RuntimeContext
    return Rooms.of({
      join: (branchId: string, member: Member) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          // Only these headers say who joins; any `x-smithers-*` the browser sent is dropped first.
          const headers = Object.fromEntries(
            Object.entries(request.headers).filter(([name]) => !name.toLowerCase().startsWith("x-smithers-")),
          )
          const forwarded = request.modify({
            headers: Headers.fromInput({
              ...headers,
              [PRINCIPAL_HEADER]: member.principal,
              [NAME_HEADER]: member.name,
              [ROLE_HEADER]: member.role ?? "",
              [ACCESS_HEADER]: member.access,
            }),
          })
          return yield* objects.getByName(branchId).fetch(forwarded).pipe(Effect.provideService(RuntimeContext, runtime))
        }).pipe(Effect.orElseSucceed(() => HttpServerResponse.empty({ status: 503 }))),
      enforce: (branchId, policy) =>
        objects.getByName(branchId).enforce(policy).pipe(
          Effect.provideService(RuntimeContext, runtime),
          Effect.mapError(() => new RoomUnavailable()),
        ),
    })
  })

/** `Rooms` as a layer, for the runtime that calls it. */
export const roomsLayer = (objects: Objects) => Layer.effect(Rooms, roomsOver(objects))
