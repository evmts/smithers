/**
 * The reconnecting WebSocket a page holds to a terminal: one socket to a host
 * that speaks `TerminalProtocol` from `@smthrs/sandbox`.
 *
 * {@link connect} dials the terminal's URL and keeps dialing it. Binary frames
 * carry bytes: the shell's output arrives at `onOutput`, and {@link Connection}
 * `send` writes keystrokes. Text frames carry control: the host's `ready`
 * opens the terminal with the viewer's access, and its `ended` ends it.
 *
 * - **Keystrokes are never queued.** `send` writes only while the terminal is
 *   open with write access, split into frames of at most
 *   `TerminalProtocol.maxFrameBytes`; anything sent otherwise is dropped,
 *   because input whose delivery is unknown is not safe to repeat.
 * - **Only the latest size is kept.** `resize` remembers it and writes it once
 *   the terminal opens with write access, and again only when it changes.
 * - **Reconnects follow the protocol.** A final close (`TerminalProtocol.isFinal`)
 *   or an `ended` frame never redials. Any other close redials after
 *   `TerminalProtocol.reconnectDelay(attempt)` on Effect's clock, until the
 *   attempts run out; reaching `ready` resets the count.
 * - **The scope owns it.** Closing the scope closes the socket and stops
 *   redialing.
 *
 * The socket comes from Effect's `Socket.WebSocketConstructor` service;
 * {@link layerWebSocket} provides the browser's own `WebSocket`.
 *
 * @since 1.0.0
 */

import { TerminalProtocol } from "@smthrs/sandbox"
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import * as Queue from "effect/Queue"
import type * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"
import type * as Stream from "effect/Stream"
import * as SubscriptionRef from "effect/SubscriptionRef"

/**
 * Where the terminal stands.
 *
 * - `Connecting`: dialing, or connected and waiting for the host's `ready`;
 * - `Open`: attached, with the viewer's `access`;
 * - `Offline`: closed with `code`, and redialing as reconnect `attempt`
 *   (1 for the first) after its delay;
 * - `Ended`: the host ended the session, for `reason`; final;
 * - `Closed`: closed with `code`, either final or after the last attempt;
 *   final.
 *
 * @category models
 * @since 1.0.0
 */
export type Status =
  | { readonly _tag: "Connecting" }
  | { readonly _tag: "Open"; readonly access: TerminalProtocol.Access }
  | { readonly _tag: "Offline"; readonly attempt: number; readonly code: number }
  | { readonly _tag: "Ended"; readonly reason: TerminalProtocol.EndReason }
  | { readonly _tag: "Closed"; readonly code: number }

/**
 * An open connection to a terminal.
 *
 * @category models
 * @since 1.0.0
 */
export interface Connection {
  /** Writes keystrokes while open with write access; drops them otherwise. */
  readonly send: (data: string | Uint8Array) => Effect.Effect<void>
  /** Keeps the terminal's size, clamped to the protocol's bounds, and writes it when it can. */
  readonly resize: (cols: number, rows: number) => Effect.Effect<void>
  /** The current status, then every change, until the scope closes. */
  readonly status: Stream.Stream<Status>
}

/**
 * What {@link connect} delivers.
 *
 * @category models
 * @since 1.0.0
 */
export interface Options {
  /** Each binary frame from the host, in order, as a fresh array the callee may keep or transfer. */
  readonly onOutput: (bytes: Uint8Array) => void
}

/**
 * Provides `Socket.WebSocketConstructor` with the browser's own `WebSocket`.
 *
 * @category layers
 * @since 1.0.0
 */
export const layerWebSocket: Layer.Layer<Socket.WebSocketConstructor> = Socket.layerWebSocketConstructorGlobal

type Event =
  | { readonly _tag: "Message"; readonly data: unknown }
  | { readonly _tag: "Close"; readonly code: number }

type Outcome =
  | { readonly _tag: "Ended" }
  | { readonly _tag: "Closed"; readonly code: number; readonly ready: boolean }

interface Size {
  readonly cols: number
  readonly rows: number
}

/** The code a connection that dropped without a close frame reports. */
const dropped = 1006

const encoder = new TextEncoder()

const dimension = (value: number, max: number): number => Math.min(max, Math.max(1, Math.trunc(value) || 1))

const bytesOf = (data: unknown): Effect.Effect<Uint8Array> => {
  if (data instanceof ArrayBuffer) return Effect.succeed(new Uint8Array(data))
  if (ArrayBuffer.isView(data)) {
    return Effect.succeed(new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice())
  }
  return Effect.map(Effect.promise(() => (data as Blob).arrayBuffer()), (buffer) => new Uint8Array(buffer))
}

/**
 * Connects to the terminal at `url` and keeps it connected until the scope
 * closes. The connection starts dialing at once; `status` says where it
 * stands.
 *
 * @category constructors
 * @since 1.0.0
 */
export const connect = (
  url: string,
  options: Options
): Effect.Effect<Connection, never, Scope.Scope | Socket.WebSocketConstructor> =>
  Effect.gen(function*() {
    const construct = yield* Socket.WebSocketConstructor
    const status = yield* Effect.acquireRelease(
      SubscriptionRef.make<Status>({ _tag: "Connecting" }),
      (ref) => PubSub.shutdown(ref.pubsub)
    )
    const live: {
      socket: Socket.WebSocketLike | undefined
      access: TerminalProtocol.Access | undefined
      size: Size | undefined
      sent: Size | undefined
    } = { socket: undefined, access: undefined, size: undefined, sent: undefined }

    const writeSize = () => {
      const { access, sent, size, socket } = live
      if (socket === undefined || access !== "write" || size === undefined) return
      if (sent?.cols === size.cols && sent.rows === size.rows) return
      live.sent = size
      socket.send(TerminalProtocol.encodeResize(size.cols, size.rows))
    }

    /** Opens one socket whose events land in `events`; returns its hang-up. */
    const dial = (events: Queue.Queue<Event>): () => void => {
      let socket: Socket.WebSocketLike
      try {
        socket = construct(url)
      } catch {
        Queue.offerUnsafe(events, { _tag: "Close", code: dropped })
        return () => {}
      }
      ;(socket as { binaryType?: string }).binaryType = "arraybuffer"
      const onMessage = (event: Socket.WebSocketEvent) => {
        Queue.offerUnsafe(events, { _tag: "Message", data: event.data })
      }
      // A close event always follows an error event.
      const onError = () => {}
      const onClose = (event: Socket.WebSocketEvent) => {
        live.socket = undefined
        live.access = undefined
        Queue.offerUnsafe(events, { _tag: "Close", code: (event as CloseEvent).code })
      }
      socket.addEventListener("message", onMessage)
      socket.addEventListener("error", onError)
      socket.addEventListener("close", onClose)
      live.socket = socket
      live.sent = undefined
      return () => {
        socket.removeEventListener("message", onMessage)
        socket.removeEventListener("error", onError)
        socket.removeEventListener("close", onClose)
        live.socket = undefined
        live.access = undefined
        socket.close(1000)
      }
    }

    /** One connection, from dialing to its close or its `ended`. */
    const session: Effect.Effect<Outcome> = Effect.scoped(Effect.gen(function*() {
      const events = yield* Queue.unbounded<Event>()
      yield* Effect.acquireRelease(Effect.sync(() => dial(events)), (hangUp) => Effect.sync(hangUp))
      let ready = false
      while (true) {
        const event = yield* Queue.take(events)
        if (event._tag === "Close") return { _tag: "Closed", code: event.code, ready } as const
        if (typeof event.data !== "string") {
          options.onOutput(yield* bytesOf(event.data))
          continue
        }
        const control = TerminalProtocol.decodeServerControl(event.data)
        if (control?.type === "ready") {
          ready = true
          live.access = control.access
          writeSize()
          yield* SubscriptionRef.set(status, { _tag: "Open", access: control.access })
        } else if (control?.type === "ended") {
          live.access = undefined
          yield* SubscriptionRef.set(status, { _tag: "Ended", reason: control.reason })
          return { _tag: "Ended" } as const
        }
      }
    }))

    const run = Effect.gen(function*() {
      let attempt = 0
      while (true) {
        const outcome = yield* session
        if (outcome._tag === "Ended") return
        attempt = outcome.ready ? 1 : attempt + 1
        const delay = TerminalProtocol.isFinal(outcome.code) ? undefined : TerminalProtocol.reconnectDelay(attempt)
        if (delay === undefined) return yield* SubscriptionRef.set(status, { _tag: "Closed", code: outcome.code })
        yield* SubscriptionRef.set(status, { _tag: "Offline", attempt, code: outcome.code })
        yield* Effect.sleep(delay)
        yield* SubscriptionRef.set(status, { _tag: "Connecting" })
      }
    })
    yield* Effect.forkScoped(run)

    return {
      send: (data) =>
        Effect.sync(() => {
          const socket = live.socket
          if (socket === undefined || live.access !== "write") return
          const bytes = typeof data === "string" ? encoder.encode(data) : new Uint8Array(data)
          for (let at = 0; at < bytes.byteLength; at += TerminalProtocol.maxFrameBytes) {
            socket.send(bytes.subarray(at, at + TerminalProtocol.maxFrameBytes))
          }
        }),
      resize: (cols, rows) =>
        Effect.sync(() => {
          live.size = {
            cols: dimension(cols, TerminalProtocol.maxCols),
            rows: dimension(rows, TerminalProtocol.maxRows)
          }
          writeSize()
        }),
      status: SubscriptionRef.changes(status)
    }
  })
