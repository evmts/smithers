import { TerminalSocket } from "@smthrs/platform-browser"
import { Clock, Effect, FiberHandle, Metric, Option, Ref, Stream } from "effect"
import { FlowDispatch } from "../../flows/dispatch"
import { AuthStore, SESSION } from "../auth/store"
import { DEFAULT_COLS, DEFAULT_ROWS, OPEN_DEADLINE_SECONDS, terminalSocketRoute } from "./contract"
import { bytes, ended, openMs, reconnects } from "./metrics"
import { PANEL, type Panel, type TerminalRow } from "./schema"
import { TerminalStore } from "./store"

// What a person does with a branch's terminal (decision 0013 §3, docs/features/branch-workspace.md#the-terminal), and
// what the tab does for them. Opening is the flow `terminal/open`; the terminal's row says when its shell is up. The
// socket is `@smthrs/platform-browser`'s `TerminalSocket`, which reconnects by itself; its bytes go straight to the
// frame. Nothing here counts or logs a byte's content.

/** Where the frame's output goes. */
export interface Sink {
  readonly output: (bytes: Uint8Array) => void
}

const setPanel = (fields: Partial<Omit<Panel, "id">>) =>
  Effect.flatMap(TerminalStore, ({ panel }) =>
    Effect.orDie(panel.update(PANEL, (row) => void Object.assign(row, fields))))

const panelNow = Effect.flatMap(TerminalStore, ({ panel }) => Effect.map(panel.get(PANEL), Option.getOrThrow))

/** How long the machine gets to wake and start the shell before the panel says it failed. */
const OPEN_WITHIN = `${OPEN_DEADLINE_SECONDS} seconds`

/** The signed-in person's GitHub login, if any: whose terminals are theirs. */
const loginNow = Effect.gen(function* () {
  const { session } = yield* AuthStore
  return Option.getOrThrow(yield* session.get(SESSION)).login
})

/** The person's live terminal among `rows`, if they have one. */
const mineOf = (rows: ReadonlyArray<TerminalRow>, login: string | null) =>
  login === null
    ? undefined
    : rows.find((row) => row.ownerLogin === login && (row.status === "open" || row.status === "opening"))

/**
 * Shows branch `branchId`'s terminal panel: `watching`, a terminal to watch (anyone's), or else the person's own open
 * one, attached once it is open; otherwise Open terminal. `null` shows none, and lets go of the socket.
 */
export const show = (branchId: string | null, watching?: string) =>
  Effect.gen(function* () {
    const store = yield* TerminalStore
    yield* FiberHandle.clear(store.attached)
    if (branchId === null) {
      return yield* setPanel({ branchId: null, terminalId: null, phase: "idle", access: null })
    }
    const terminals = yield* store.terminals(branchId)
    // The branch's rows first, so the panel never offers Open terminal for one that is open.
    yield* terminals.preload.pipe(Effect.timeoutOption("10 seconds"), Effect.ignore)
    const rows = yield* terminals.toArray
    const shown = watching === undefined
      ? mineOf(rows, yield* loginNow)
      : rows.find((row) => row.id === watching)
    yield* setPanel({
      branchId,
      terminalId: shown?.id ?? null,
      phase: shown === undefined ? "idle" : shown.status === "open" ? "connecting" : phaseOf(shown),
      access: null,
    })
    if (shown?.status === "opening") yield* Effect.forkIn(awaitOpen(branchId, shown.id, undefined), store.scope)
  }).pipe(Effect.annotateLogs({ feature: "terminal" }))

/** The panel's phase for a row that isn't open. */
const phaseOf = (row: TerminalRow): Panel["phase"] =>
  row.status === "opening" ? "opening" : row.status === "failed" ? "failed" : "ended"

/** Waits for terminal `terminalId`'s row to settle, then shows it open, or why not. */
const awaitOpen = (branchId: string, terminalId: string, startedAt: number | undefined) =>
  Effect.gen(function* () {
    const terminals = yield* (yield* TerminalStore).terminals(branchId)
    const settled = (row: TerminalRow | undefined) => row !== undefined && row.status !== "opening"
    const now = Option.getOrUndefined(yield* terminals.get(terminalId))
    const row = settled(now)
      ? now!
      : (yield* terminals.awaitMatch(
        (change) => change.value.id === terminalId && change.value.status !== "opening",
        OPEN_WITHIN,
      ).pipe(Effect.option, Effect.flatMap(() => terminals.get(terminalId)), Effect.map(Option.getOrUndefined)))
    const panel = yield* panelNow
    if (panel.terminalId !== terminalId) return
    if (row === undefined || row.status === "opening") return yield* setPanel({ phase: "failed" })
    yield* setPanel({ phase: row.status === "open" ? "connecting" : phaseOf(row) })
    if (row.status === "open" && startedAt !== undefined) yield* Ref.set((yield* TerminalStore).openedAt, startedAt)
  })

/**
 * Open terminal: opens the person's terminal on the panel's branch through `terminal/open`, and shows it once its
 * shell is up. A person has one terminal per branch, so this shows theirs if it is already open.
 */
export const open = Effect.gen(function* () {
  const store = yield* TerminalStore
  const panel = yield* panelNow
  if (panel.branchId === null || panel.phase === "opening") return
  const branchId = panel.branchId
  const terminalId = crypto.randomUUID()
  const startedAt = yield* Clock.currentTimeMillis
  yield* setPanel({ terminalId, phase: "opening", access: null })
  const dispatched = yield* Effect.result(
    (yield* FlowDispatch).dispatch(
      "terminal/open",
      { branchId, terminalId, cols: DEFAULT_COLS, rows: DEFAULT_ROWS },
      { door: "button" },
    ),
  )
  // The person moved on while it was asked (another branch, or none): the answer isn't this panel's.
  if ((yield* panelNow).terminalId !== terminalId) return
  if (dispatched._tag === "Failure" || dispatched.success._tag === "Failed") {
    const error = dispatched._tag === "Success" && dispatched.success._tag === "Failed"
      ? dispatched.success.error
      : undefined
    const refused = error?._tag === "@smthrs/mvp/terminal/TerminalOpenRefused" ? error.reason : undefined
    return yield* setPanel({ phase: refused === "sign_in" || refused === "forbidden" ? "no_access" : "failed" })
  }
  const answered = dispatched.success.value.terminalId
  yield* setPanel({ terminalId: answered })
  yield* Effect.forkIn(awaitOpen(branchId, answered, startedAt), store.scope)
}).pipe(Effect.withSpan("terminal.open.press"), Effect.annotateLogs({ feature: "terminal" }))

/** The socket's status, as the panel shows it, with its records. */
const onStatus = (status: TerminalSocket.Status) => {
  switch (status._tag) {
    case "Connecting":
      return setPanel({ phase: "connecting" })
    case "Open":
      return setPanel({ phase: "open", access: status.access })
    case "Offline":
      return Effect.andThen(
        Metric.update(Metric.withAttributes(reconnects, { code: String(status.code) }), 1),
        setPanel({ phase: "offline" }),
      )
    case "Ended":
      return Effect.andThen(
        Metric.update(Metric.withAttributes(ended, { reason: status.reason }), 1),
        setPanel({ phase: "ended" }),
      )
    case "Closed":
      return setPanel({ phase: status.code === 1008 ? "no_access" : "ended" })
  }
}

/**
 * How long an attached panel watches its terminal's row. The wait is a timer, and a timer holds at most 2^31 - 1 ms
 * (about 24.8 days): a longer one fires at once, in browsers and Node alike, which would end the panel as it attaches.
 */
const ROW_WATCH = "24 days"

/** The socket URL of terminal `terminalId` on the app's `origin`: `ws:` for `http:`, `wss:` for `https:`. */
export const socketUrl = (origin: string, terminalId: string) =>
  `${origin.replace(/^http/, "ws")}${terminalSocketRoute(terminalId)}`

/**
 * Attaches this tab to terminal `terminalId`, writing its output to `sink`, until `detach` or another attach. The
 * socket reconnects by itself; the panel follows its status and the terminal's row: a row that ends stops it.
 */
export const attach = (terminalId: string, sink: Sink) =>
  Effect.gen(function* () {
    const store = yield* TerminalStore
    // The socket calls back with each frame outside any fiber: its records run with this attach's services.
    const record = Effect.runSyncWith(yield* Effect.context<TerminalStore>())
    const run = Effect.scoped(Effect.gen(function* () {
      const connection = yield* TerminalSocket.connect(socketUrl(store.origin, terminalId), {
        onOutput: (chunk) => {
          sink.output(chunk)
          record(Effect.andThen(
            recordFirstByte,
            Metric.update(Metric.withAttributes(bytes, { direction: "out" }), chunk.length),
          ))
        },
      })
      yield* Ref.set(store.connection, connection)
      const panel = yield* panelNow
      const terminals = panel.branchId === null ? undefined : yield* store.terminals(panel.branchId)
      // The row ending (the machine slept or was lost) ends the panel, even while the socket redials.
      const rowEnds = terminals === undefined ? Effect.never : terminals.awaitMatch(
        (change) => change.value.id === terminalId && (change.value.status === "ended" || change.value.status === "failed"),
        ROW_WATCH,
      ).pipe(Effect.ignore, Effect.andThen(setPanel({ phase: "ended" })))
      yield* Effect.raceFirst(connection.status.pipe(Stream.runForEach(onStatus)), rowEnds)
    })).pipe(
      Effect.provide(TerminalSocket.layerWebSocket),
      Effect.ensuring(Effect.flatMap(TerminalStore, (s) => Ref.set(s.connection, undefined))),
      Effect.withSpan("terminal.connect"),
    )
    yield* FiberHandle.run(store.attached, run)
  }).pipe(Effect.annotateLogs({ feature: "terminal" }))

/** Records `terminal_open_ms` once, at the first byte after Open terminal. */
const recordFirstByte = Effect.gen(function* () {
  const startedAt = yield* Ref.getAndSet((yield* TerminalStore).openedAt, undefined)
  if (startedAt !== undefined) yield* Metric.update(openMs, (yield* Clock.currentTimeMillis) - startedAt)
})

/** Lets go of the socket this tab holds. */
export const detach = Effect.flatMap(TerminalStore, (store) => FiberHandle.clear(store.attached))

/** What the person typed: sent while the terminal is open to them for writing, dropped otherwise. */
export const input = (data: string) =>
  Effect.gen(function* () {
    const connection = yield* Ref.get((yield* TerminalStore).connection)
    if (connection === undefined) return
    yield* connection.send(data)
    yield* Metric.update(Metric.withAttributes(bytes, { direction: "in" }), data.length)
  })

/** The frame's size: the shell follows the owner's. */
export const resize = (cols: number, rows: number) =>
  Effect.gen(function* () {
    const connection = yield* Ref.get((yield* TerminalStore).connection)
    if (connection !== undefined) yield* connection.resize(cols, rows)
  })
