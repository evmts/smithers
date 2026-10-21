import { Effect, Metric, Option } from "effect"
import { AuthClient } from "./api"
import { DeviceWipe } from "./device"
import { deviceWipes, signInPresses, signOuts } from "./metrics"
import type { Confirmed, Session } from "./schema"
import { AuthStore, SESSION } from "./store"

// What a person does about signing in, and what the tab does for them. Each action returns once the tab's state
// says so; a request it starts runs in the store's scope and settles the state when ChatApi answers.

const change = (fields: Partial<Omit<Session, "id">>) =>
  Effect.gen(function* () {
    const { session } = yield* AuthStore
    yield* session.update(SESSION, (row) => void Object.assign(row, fields))
  }).pipe(Effect.orDie)

const current = Effect.flatMap(AuthStore, ({ session }) => Effect.map(session.get(SESSION), Option.getOrThrow))

/**
 * Keeps the session ChatApi confirmed on the device, or, with `null`, forgets it, once the device's own row has loaded:
 * a write before it would race the restore.
 */
const confirm = (row: Omit<Confirmed, "id"> | null) =>
  Effect.gen(function* () {
    const { confirmed } = yield* AuthStore
    yield* Effect.ignore(confirmed.restored)
    const kept = yield* confirmed.get(SESSION)
    if (row === null) {
      // Stored before it returns: a sign-out wipes the device next, and a delete still in flight would fail against it.
      if (Option.isSome(kept)) yield* (yield* confirmed.delete(SESSION)).persisted
      return
    }
    if (Option.isNone(kept)) yield* confirmed.insert({ id: SESSION, ...row })
    else yield* confirmed.update(SESSION, (draft) => void Object.assign(draft, row))
  }).pipe(Effect.orDie)

/** Marks the session row `restored` once the device's confirmed session has been read, or couldn't be. */
export const restore = Effect.gen(function* () {
  const { confirmed } = yield* AuthStore
  yield* Effect.ignore(confirmed.restored)
  yield* change({ restored: true })
})

/** Asks ChatApi who this browser is signed in as, and shows it: `unreachable` when ChatApi couldn't say. */
export const load = Effect.gen(function* () {
  const client = yield* AuthClient
  const answer = yield* Effect.result(client.session)
  if (answer._tag === "Failure") {
    yield* change({ status: "unreachable" })
    return yield* Effect.logWarning("session unreachable").pipe(
      Effect.annotateLogs(answer.failure.status === undefined ? {} : { status: answer.failure.status }),
    )
  }
  const state = answer.success
  // Expiry keeps the last owner. A different account must finish the coordinated wipe before its state is shown.
  const { confirmed } = yield* AuthStore
  yield* Effect.ignore(confirmed.restored)
  const owner = yield* confirmed.get(SESSION)
  if (state.signedIn && Option.isSome(owner) && (owner.value.personId !== undefined && state.personId !== undefined ? owner.value.personId !== state.personId : owner.value.login.toLowerCase() !== state.login.toLowerCase())) {
    yield* change({ status: "loading", login: null, role: null })
    yield* wipeDevice
    return
  }
  yield* change(
    state.signedIn
      ? { status: "signed_in", login: state.login, role: state.role, available: true }
      : { status: "signed_out", login: null, role: null, available: state.available },
  )
  if (state.signedIn) yield* confirm({ login: state.login, role: state.role, ...(state.personId === undefined ? {} : { personId: state.personId }) })
  yield* Effect.logInfo("session loaded").pipe(Effect.annotateLogs({ signedIn: state.signedIn }))
}).pipe(Effect.annotateLogs({ feature: "auth" }))

/** "Sign in with GitHub" pressed: counted. The link it is takes the browser to GitHub. */
export const pressSignIn = Metric.update(signInPresses, 1).pipe(
  Effect.andThen(Effect.logInfo("sign in pressed")),
  Effect.annotateLogs({ feature: "auth" }),
)

/**
 * Wipes this device's synced data and outbox once ChatApi has ended the session (decision 0008 §4.6): what came from
 * the server doesn't outlive the session on a shared device. Counted and logged; the browser's host then reloads, and
 * the page continues as a visitor.
 */
const wipeDevice = Effect.gen(function* () {
  const wiped = yield* Effect.result((yield* DeviceWipe).wipe)
  const outcome = wiped._tag === "Success" ? "wiped" : "failed"
  yield* Metric.update(Metric.withAttributes(deviceWipes, { outcome }), 1)
  yield* outcome === "wiped" ? Effect.logInfo("device wiped") : Effect.logWarning("device wipe failed")
})

/** Sends the sign-out and settles the tab's state when ChatApi answers; a sign-out ChatApi took wipes the device. */
const sendSignOut = Effect.gen(function* () {
  const client = yield* AuthClient
  const sent = yield* Effect.result(client.signOut)
  if (sent._tag === "Failure") {
    yield* change({ signingOut: false })
    yield* Metric.update(Metric.withAttributes(signOuts, { outcome: "failed" }), 1)
    return yield* Effect.logWarning("sign out failed").pipe(
      Effect.annotateLogs(sent.failure.status === undefined ? {} : { status: sent.failure.status }),
    )
  }
  yield* change({ status: "signed_out", login: null, role: null, signingOut: false })
  yield* confirm(null)
  yield* Metric.update(Metric.withAttributes(signOuts, { outcome: "signed_out" }), 1)
  yield* Effect.logInfo("signed out")
  yield* wipeDevice
}).pipe(Effect.annotateLogs({ feature: "auth" }))

/** Sign out pressed: `signingOut` at once, then signed out when ChatApi ends the session. Once at a time. */
export const signOut = Effect.gen(function* () {
  if ((yield* current).signingOut) return
  yield* change({ signingOut: true })
  yield* Effect.forkIn(sendSignOut, (yield* AuthStore).scope, { startImmediately: true })
})
