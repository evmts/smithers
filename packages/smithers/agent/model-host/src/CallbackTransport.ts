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
import { isIP } from "node:net"
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
 * What `created` separates, and how: a name that never resolved and a SYN that
 * was never answered both leave an attempt here with one connection begun and
 * none ended, because the dispatcher publishes its connection record before
 * the lookup and reports nothing further until one of them finishes. The
 * socket that dial created tells them apart — `lookupBegan` without
 * `lookupEnded` is a name still in the resolver, and `lookupEnded` without a
 * connection ended is a name answered and a connection that never came up. A
 * connection that *fails* also names itself (`connectCode`, so `ENOTFOUND`
 * reads apart from `ECONNREFUSED`).
 *
 * That split holds for a dial this host makes itself. NO resolution record at
 * all means one of two things, and they are not distinguished: the dial was
 * to an address, or a proxy carried it — which is every hosted guest, in
 * either shape the proxy takes. A guest never resolves its journal's name;
 * its proxy does. So the absence of these fields is not evidence that no name
 * was involved, and the earlier reading of it as such was wrong: measured on
 * Node 26.5.0 through a real proxy, a healthy callback reported one
 * resolution begun and none ended under a CONNECT tunnel, and both halves of
 * the proxy's own resolution when the request went absolute-form — each read
 * as the journal's name, and neither was.
 *
 * What it still does not separate: a hang after the name is answered is a
 * connection the kernel is retrying, and whether that is a dropped SYN, a
 * silent middlebox or a filtered route is not in any record this host takes.
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
   * The host and port the dispatcher spells for this attempt's connection,
   * which is whatever its own request record names. A guest reaches its
   * journal through the sandbox's egress proxy, and the two proxy shapes
   * spell it differently, and which one a guest gets follows the journal's
   * scheme rather than its proxy: under `NODE_USE_ENV_PROXY=1` an `https`
   * journal (the production one) is CONNECTed, so the request keeps the
   * journal's own origin and is dialled by name through the tunnel, while an
   * `http` journal is sent absolute-form, so the request names the proxy as
   * its origin and carries the journal's URL as its path. Taking the host from the
   * record rather than from the callback URL matches `connectParams.host` in
   * both, so the connection counts are not silently always zero in one. That
   * is a count of the hop the request took, which is what makes it sound; a
   * resolution is a name, so `ownHost` is what decides whose it is.
   */
  dialHost: string
  /**
   * The host this attempt's own callback origin spells, which is the only
   * name whose resolution is this attempt's to report. `dialHost` differs
   * from it exactly when a proxy carried the request absolute-form and the
   * dispatcher dialled the proxy instead.
   */
  readonly ownHost: string
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
  lookupBegan: number
  lookupEnded: number
  lookupCode: string | undefined
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
  readonly connectParams: { readonly host: string; readonly hostname: string }
}
interface ClientSocketMessage {
  readonly socket: {
    readonly once: (event: string, listener: (error: { readonly code?: unknown } | null) => void) => unknown
  }
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

// The socket a dial created, for exactly as long as claiming it is certain.
// `net.client.socket` carries no origin, so it is attributable only by when it
// arrives: the dispatcher publishes its dial record and then creates the socket
// inside one synchronous turn, with no point between them where another dial's
// socket could be published. A claim is therefore taken by the first socket
// after it and dropped at the end of that turn; a socket that arrives later is
// somebody else's and is left alone rather than guessed at.
let dialling: ReadonlyArray<AttemptState> | undefined

const onBeforeConnect = (message: unknown): void => {
  const dialled: Array<AttemptState> = []
  forOrigin(message, (state) => {
    state.connectBegan += 1
    dialled.push(state)
  })
  // The socket published next belongs to THIS dial, so whatever claim an
  // earlier dial left unconsumed is stale from here on: release it before any
  // branch below returns without arming a new one.
  dialling = undefined
  // A dial for a host no open attempt named, arriving while one of them is
  // waiting for its socket, is the connector that attempt's dial was handed
  // to: a forward proxy opening its own connection. The socket that follows
  // belongs to the proxy, so the resolution on it — or the absence of one,
  // when the proxy is an address — is not this origin's name, and claiming it
  // reports a resolution this host never performed.
  if (dialled.length === 0) return
  // A dial that names something other than the attempt's own origin is its
  // proxy, and the dispatcher's record is where that shows: an absolute-form
  // proxied request (an `http` journal under `NODE_USE_ENV_PROXY=1`) takes
  // the proxy as its origin, so the only dial it publishes is the proxy's and
  // the socket resolves the PROXY's name. Counting that hop's connection is
  // sound and stays; claiming its resolution as the journal's is the same
  // false record as under a tunnel, so it is dropped here too.
  const resolving = dialled.filter((state) => state.dialHost === state.ownHost)
  if (resolving.length === 0) return
  // A dial to an address has no name to resolve, and recording a resolution it
  // never began would read as one that never returned.
  if (isIP((message as ConnectMessage).connectParams.hostname) !== 0) return
  dialling = resolving
  queueMicrotask(() => {
    dialling = undefined
  })
}

// The resolver record `created` needed. A name that never resolves and a SYN
// that is never answered both leave an attempt at `created` with one connection
// begun and none ended; the socket its dial created says which, because it
// emits `lookup` once the name is answered, before the connection is attempted.
const onClientSocket = (message: unknown): void => {
  const dialled = dialling
  dialling = undefined
  if (dialled === undefined) return
  const { socket } = message as ClientSocketMessage
  for (const state of dialled) state.lookupBegan += 1
  socket.once("lookup", (error) => {
    const code = error === null ? undefined : codeOf(error.code)
    for (const state of dialled) {
      state.lookupEnded += 1
      if (code !== undefined) state.lookupCode = code
    }
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
  ["undici:client:connectError", onConnectError],
  ["net.client.socket", onClientSocket]
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
  ...(state.lookupBegan === 0 ? {} : { lookupBegan: state.lookupBegan, lookupEnded: state.lookupEnded }),
  ...(state.lookupCode === undefined ? {} : { lookupCode: state.lookupCode }),
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
 * and resolution counts, the socket-reuse flag and a failure's short code are
 * all of it.
 *
 * @category constructors
 * @since 1.0.0-rc.1
 */
export const observeCallbackTransport = (callbackBaseUrl: string): ObservedCallbackTransport => {
  const url = new URL(callbackBaseUrl)
  const mine = new Set<AttemptState>()
  // Closing is counted once however often it is asked for. The subscription is
  // shared, so a second `close` would drop another turn's observer with it and
  // leave that turn reporting `none` — the one reading that clears everything
  // below this host. A false `none` is worse than no record at all.
  let closed = false
  listen()
  return {
    begin: () => {
      // A closed observer attributes nothing, even while another observer
      // holds the channels up: its attempts are no longer being watched, so
      // they report only what they can prove.
      if (closed) return inertCallbackTransport.begin()
      const state: AttemptState = {
        origin: url.origin,
        dialHost: url.host,
        ownHost: url.host,
        claimed: false,
        phase: "none",
        reused: undefined,
        errorName: undefined,
        errorCode: undefined,
        connectBegan: 0,
        connectEnded: 0,
        connectFailed: 0,
        connectCode: undefined,
        lookupBegan: 0,
        lookupEnded: 0,
        lookupCode: undefined
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
      if (closed) return
      closed = true
      for (const state of mine) open.delete(state)
      mine.clear()
      stopListening()
    }
  }
}
