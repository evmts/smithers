/**
 * Transport-phase attribution for one hosted turn's journal callbacks.
 *
 * A callback that never answers is a transport fault, and until now the guest
 * could say only that: `chat_callback pending`, with no way to tell a request
 * that never left the dispatcher from one whose connection never came up from
 * one whose bytes reached the journal and were never answered. Production turn
 * 2d851bdd ended on exactly that ambiguity — its commit was attempted, no
 * socket for it was in the guest's IPv4 table, and nothing recorded which of
 * those phases it was in — so the fault is still unattributed.
 *
 * This reads the phases from Node's own `undici` diagnostics channels rather
 * than from anything this host guesses: the request the dispatcher created,
 * the connections its origin opened, the headers written to a socket, the
 * response headers read back and the body's end. One attempt's records are
 * correlated by the request object the channels carry, which is why nothing
 * here needs a header, a URL or a body to identify a turn.
 *
 * @since 1.0.0-rc.1
 */

import { AsyncLocalStorage } from "node:async_hooks"
import { subscribe, unsubscribe } from "node:diagnostics_channel"
import type { HostDiagnosticFields } from "./HostDiagnostics.ts"

/**
 * The furthest point one callback attempt reached on the wire.
 *
 * `none` is the strongest of these: the dispatcher never saw the request, so
 * nothing below this host can be blamed for it. A failure does not replace
 * the phase — how far an attempt got and how it ended are separate facts, and
 * an abort that lands after the journal's headers must not read as an attempt
 * that never got them.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export type CallbackTransportPhase =
  /** No dispatcher record: the request never reached `undici` at all. */
  | "none"
  /** The dispatcher took the request and has not written it to a socket. */
  | "created"
  /** The request's headers are on a socket; the journal has answered nothing. */
  | "sent"
  /** The journal's response headers arrived; its receipt has not. */
  | "responded"
  /** The response body ended. */
  | "received"

/**
 * One attempt's transport record: the phase it reached, and the connection
 * work its origin did while it was open.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export interface CallbackAttempt {
  /** Runs one request so the dispatcher's records are attributed to it. */
  readonly run: <A>(action: () => Promise<A>) => Promise<A>
  /** Closes the attempt and reports what it reached, as diagnostic fields. */
  readonly fields: () => HostDiagnosticFields
}

/**
 * Where a producer gets an attempt from.
 *
 * @category services
 * @since 1.0.0-rc.1
 */
export interface CallbackTransport {
  readonly begin: () => CallbackAttempt
}

/**
 * A transport observer bound to one turn, which stops observing when closed.
 *
 * @category services
 * @since 1.0.0-rc.1
 */
export interface ObservedCallbackTransport extends CallbackTransport {
  readonly close: () => void
}

interface AttemptState {
  /** The callback origin, as the dispatcher spells it. */
  readonly origin: string
  /**
   * The host and port this attempt's connection is made to: the callback's
   * own until the dispatcher says otherwise, and the proxy's once a request
   * through one is seen. A guest reaches its journal through the sandbox's
   * egress proxy, and a connection there belongs to the proxy, not to the
   * journal.
   */
  dialHost: string
  /** Set once this attempt has claimed its request, so it claims no second one. */
  claimed: boolean
  phase: CallbackTransportPhase
  reused: boolean | undefined
  errorName: string | undefined
  errorCode: string | undefined
  connectBegan: number
  connectEnded: number
  connectFailed: number
  connectCode: string | undefined
}

interface RequestMessage {
  readonly request: { readonly origin: string; readonly path: string }
}
interface SocketMessage extends RequestMessage {
  readonly socket: object
}
interface ErrorMessage extends RequestMessage {
  readonly error: { readonly name: string; readonly code: unknown }
}
interface ConnectMessage {
  readonly connectParams: { readonly host: string }
}
interface ConnectErrorMessage extends ConnectMessage {
  readonly error: { readonly code: unknown }
}

// The attempt a dispatcher record belongs to. `undici` publishes its create
// record inside the caller's own async context, so the attempt that called
// `fetch` is readable there; every later record for the same request is found
// through the request object itself, because connection and socket records run
// in whichever context happened to drive the event loop.
const attempt = new AsyncLocalStorage<AttemptState>()
const byRequest = new WeakMap<object, AttemptState>()
const open = new Set<AttemptState>()
// A socket that has already carried a request. The second request to reach one
// of these reused a connection rather than opening its own.
const carried = new WeakSet<object>()

/** A short token identifies a failure; anything else is left out. */
const codeOf = (value: unknown): string | undefined => typeof value === "string" ? value : undefined

// A proxied request names the proxy as its origin and carries the callback's
// own URL as its path, so both spellings are the callback's and neither is
// anything else's.
const addressesCallback = (request: RequestMessage["request"], origin: string): boolean =>
  request.origin === origin || request.path.startsWith(`${origin}/`)

const onCreate = (message: unknown): void => {
  const current = attempt.getStore()
  // An attempt makes one request. A later one created while this attempt's
  // context is still the ambient one — another fiber's callback, sharing the
  // origin — is not this attempt's and is left unattributed.
  if (current === undefined || current.claimed) return
  const { request } = message as RequestMessage
  if (!addressesCallback(request, current.origin)) return
  byRequest.set(request, current)
  current.claimed = true
  current.dialHost = new URL(request.origin).host
  current.phase = "created"
}

const stateOf = (message: unknown): AttemptState | undefined => byRequest.get((message as RequestMessage).request)

const onSendHeaders = (message: unknown): void => {
  const state = stateOf(message)
  if (state === undefined) return
  const { socket } = message as SocketMessage
  state.reused = carried.has(socket)
  carried.add(socket)
  state.phase = "sent"
}

const onHeaders = (message: unknown): void => {
  const state = stateOf(message)
  if (state === undefined) return
  state.phase = "responded"
}

const onTrailers = (message: unknown): void => {
  const state = stateOf(message)
  if (state === undefined) return
  state.phase = "received"
}

const onError = (message: unknown): void => {
  const state = stateOf(message)
  if (state === undefined) return
  const { error } = message as ErrorMessage
  state.errorName = error.name
  state.errorCode = codeOf(error.code)
}

// A connection belongs to an origin, not to a request: `undici` opens one when
// a request needs it and reports it on its own. Every attempt open to that
// origin counts it, which is what makes "created, and a connection is still
// coming up" distinguishable from "created, and nothing is being opened".
const forOrigin = (message: unknown, count: (state: AttemptState) => void): void => {
  const { connectParams } = message as ConnectMessage
  for (const state of open) if (state.dialHost === connectParams.host) count(state)
}

const onBeforeConnect = (message: unknown): void => {
  forOrigin(message, (state) => {
    state.connectBegan += 1
  })
}

const onConnected = (message: unknown): void => {
  forOrigin(message, (state) => {
    state.connectEnded += 1
  })
}

const onConnectError = (message: unknown): void => {
  const code = codeOf((message as ConnectErrorMessage).error.code)
  forOrigin(message, (state) => {
    state.connectFailed += 1
    state.connectCode = code
  })
}

const channels: ReadonlyArray<readonly [string, (message: unknown) => void]> = [
  ["undici:request:create", onCreate],
  ["undici:client:sendHeaders", onSendHeaders],
  ["undici:request:headers", onHeaders],
  ["undici:request:trailers", onTrailers],
  ["undici:request:error", onError],
  ["undici:client:beforeConnect", onBeforeConnect],
  ["undici:client:connected", onConnected],
  ["undici:client:connectError", onConnectError]
]

// Subscribing is global, so turns share one subscription and the last observer
// to close takes it down. A runtime that publishes none of these channels is
// not an error: its attempts simply report the phase they can prove, `none`.
let observers = 0
const listen = (): void => {
  observers += 1
  if (observers === 1) { for (const [name, handler] of channels) subscribe(name, handler) }
}
const stopListening = (): void => {
  observers -= 1
  if (observers === 0) { for (const [name, handler] of channels) unsubscribe(name, handler) }
}

const report = (state: AttemptState): HostDiagnosticFields => ({
  transport: state.phase,
  ...(state.reused === undefined ? {} : { reusedSocket: state.reused }),
  ...(state.connectBegan === 0 ? {} : { connectBegan: state.connectBegan, connectEnded: state.connectEnded }),
  ...(state.connectFailed === 0 ? {} : { connectFailed: state.connectFailed }),
  ...(state.connectCode === undefined ? {} : { connectCode: state.connectCode }),
  ...(state.errorName === undefined ? {} : { errorName: state.errorName }),
  ...(state.errorCode === undefined ? {} : { errorCode: state.errorCode })
})

/**
 * A transport that observes nothing: the default, so a producer driven by a
 * caller's own fetch adds no transport fields it cannot stand behind.
 *
 * @category constructors
 * @since 1.0.0-rc.1
 */
export const inertCallbackTransport: CallbackTransport = {
  begin: () => ({ run: (action) => action(), fields: () => ({}) })
}

/**
 * Observes the dispatcher's records for callbacks to one origin.
 *
 * Only this host's own callback origin is attributed. Nothing it records
 * names a path, a header, a body or a destination: the phase, the connection
 * counts, the socket-reuse flag and a failure's short code are all of it.
 *
 * @category constructors
 * @since 1.0.0-rc.1
 */
export const observeCallbackTransport = (callbackBaseUrl: string): ObservedCallbackTransport => {
  const url = new URL(callbackBaseUrl)
  const mine = new Set<AttemptState>()
  listen()
  return {
    begin: () => {
      const state: AttemptState = {
        origin: url.origin,
        dialHost: url.host,
        claimed: false,
        phase: "none",
        reused: undefined,
        errorName: undefined,
        errorCode: undefined,
        connectBegan: 0,
        connectEnded: 0,
        connectFailed: 0,
        connectCode: undefined
      }
      open.add(state)
      mine.add(state)
      return {
        run: (action) => attempt.run(state, action),
        fields: () => {
          open.delete(state)
          mine.delete(state)
          return report(state)
        }
      }
    },
    close: () => {
      for (const state of mine) open.delete(state)
      mine.clear()
      stopListening()
    }
  }
}
