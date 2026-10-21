import type { SharedSqlite } from "@smthrs/platform-browser"
import { Cause, Data, Effect, Metric, Option, Schema } from "effect"
import type { AuthClient } from "../features/auth/api"
import { DEVICE_PERSON_HEADER, SESSION_ROUTE } from "../features/auth/contract"
import { Confirmed, SessionState } from "../features/auth/schema"

/** Bootstrap metadata, separate from collection contents: checked before the engine or a collection can open. */
const Owner = Schema.Struct({ v: Schema.Literal(1), personId: Schema.String, login: Schema.String })
export type DeviceOwner = typeof Owner.Type
export const OWNER_KEY = "smithers-device-owner-v1"
export const IDENTITY_MESSAGE = "smithers/device-identity"
export class DeviceIdentityRefused extends Data.TaggedError("DeviceIdentityRefused")<{ readonly reason: string }> {}
export const checks = Metric.counter("smithers_device_identity_checks", { incremental: true })

/** The last build's confirmed identity is the upgrade source. Never infer ownership from a new cookie. */
const legacyOwner = (database: SharedSqlite.Service) => Effect.gen(function* () {
  const tables = yield* database.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'collection_registry'")
  if (tables.length === 0) return undefined
  const registry = yield* database.execute("SELECT table_name FROM collection_registry WHERE collection_id = ?", ["auth-confirmed"])
  const table = (registry[0] as { table_name?: string } | undefined)?.table_name
  if (table === undefined) return undefined
  const rows = yield* database.execute(`SELECT value FROM "${table.replaceAll('"', '""')}"`)
  const raw = rows[0] as { value?: string } | undefined
  if (raw?.value === undefined) return undefined
  const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(Confirmed))(raw.value)
  return Option.getOrUndefined(decoded)
})

/**
 * Runs at the host boundary on every engine activation, before any resume or SQLite response. Ownership survives
 * expiry. The offline path retains the owner and binds all later requests to them; a new cookie cannot take their
 * queued writes. A mismatch fails closed and asks every page to finish the existing coordinated wipe.
 */
export const authorizeDevice = (options: {
  readonly database: SharedSqlite.Service
  readonly session: AuthClient["Service"]["session"]
  readonly expectedOwner?: DeviceOwner
  readonly report: (owner: DeviceOwner | undefined, outcome: string) => void
}) => {
  let stage = "owner"
  return Effect.gen(function* () {
    const { database } = options
    // This host-level ownership record is deliberately outside the synced/clearable collection rows. Its schema is
    // versioned here; neither an expired auth-confirmed row nor a localStorage hint can transfer ownership.
    yield* database.execute("CREATE TABLE IF NOT EXISTS smithers_device_identity (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), v INTEGER NOT NULL CHECK (v = 1), person_id TEXT NOT NULL, login TEXT NOT NULL)")
    const rows = yield* database.execute("SELECT v, person_id AS personId, login FROM smithers_device_identity WHERE singleton = 1")
    const metadata = rows[0] === undefined ? undefined : Schema.decodeUnknownSync(Owner)(rows[0])
    // Stable ownership is independent of collection setup. A navigation can interrupt TanStack after registration
    // but before physical table creation; only an upgrade without this durable proof needs those legacy rows.
    stage = "legacy"
    const legacy = metadata === undefined ? yield* legacyOwner(database) : undefined
    stage = "registry"
    const kept = metadata ?? (legacy?.personId !== undefined ? { v: 1 as const, personId: legacy.personId, login: legacy.login } : undefined)
    const registry = yield* database.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'collection_registry'")
    const unownedCollections = kept === undefined && legacy === undefined && registry.length > 0
      ? yield* database.execute("SELECT collection_id FROM collection_registry WHERE collection_id NOT IN ('preferences', 'auth-confirmed')") : []
    const unowned = unownedCollections.length > 0
    stage = "session"
    const result = yield* Effect.result(options.session)
    let owner = kept
    let outcome: string
    if (result._tag === "Failure") {
      // A legacy identity without a stable id can be read offline, but sends are blocked until it is verified online.
      owner ??= legacy === undefined ? undefined : { v: 1, personId: "@unverified", login: legacy.login }
      outcome = "offline"
    } else if (!result.success.signedIn) {
      outcome = kept !== undefined || legacy !== undefined || unowned ? "signed_out" : "visitor"
    } else {
      const identity = result.success
      if (identity.personId === undefined) return yield* new DeviceIdentityRefused({ reason: "missing_person" })
      const matches = kept !== undefined ? kept.personId === identity.personId : legacy === undefined
      // An earlier build may already have forgotten its owner on expiry. Its nonempty device cannot be assigned to
      // whoever next signs in. Preserve it while offline; online, coordinate the same wipe as an account change.
      outcome = !matches || unowned || (options.expectedOwner !== undefined && options.expectedOwner.personId !== identity.personId) ? "changed" : "verified"
      if (outcome === "verified") {
        owner = { v: 1, personId: identity.personId, login: identity.login }
        stage = "claim"
        yield* database.execute("INSERT INTO smithers_device_identity (singleton, v, person_id, login) VALUES (1, 1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET person_id = excluded.person_id, login = excluded.login", [owner.personId, owner.login])
      }
    }
    yield* Metric.update(Metric.withAttributes(checks, { outcome }), 1)
    yield* Effect.logInfo("auth.device_identity").pipe(Effect.annotateLogs({ outcome }))
    yield* Effect.sync(() => options.report(owner, outcome))
    if (outcome === "changed" || outcome === "signed_out") return yield* new DeviceIdentityRefused({ reason: outcome })
  }).pipe(Effect.tapCause((cause) => {
    const failure = Cause.squash(cause)
    if (failure instanceof DeviceIdentityRefused && (failure.reason === "changed" || failure.reason === "signed_out")) return Effect.void
    return Metric.update(Metric.withAttributes(checks, { outcome: "unavailable" }), 1).pipe(
      Effect.andThen(Effect.logWarning("auth.device_identity").pipe(Effect.annotateLogs({ outcome: "unavailable", stage, reason: failure instanceof DeviceIdentityRefused ? failure.reason : "storage" }))),
    )
  }))
}

/** A request is always bound to the data this page or worker opened, including an anonymous/offline opening. */
export const boundFetch = (fetch: typeof globalThis.fetch, owner: () => DeviceOwner | undefined, origin: string, ready: Promise<void> = Promise.resolve(), reauthorize?: () => Promise<void>): typeof globalThis.fetch => {
  let recovering: Promise<void> | undefined
  return async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) return fetch(request)
    await ready
    if (recovering !== undefined) {
      await recovering
      throw new DeviceIdentityRefused({ reason: "reauthorizing" })
    }
    const principal = owner()?.personId
    const headers = new Headers(request.headers)
    headers.set(DEVICE_PERSON_HEADER, principal ?? "@visitor")
    const response = await fetch(new Request(request, { headers }))
    if (reauthorize !== undefined && (principal === undefined || principal === "@unverified") && url.pathname === SESSION_ROUTE && response.ok) {
      const session = readSession(await response.clone().json().catch(() => undefined))
      if (session?.signedIn) {
        // Never publish a signed-in state on a runtime opened without that owner's proof. The host reactivates
        // through its coordinated wipe/handshake, and every later request remains sealed until teardown.
        await (recovering ??= reauthorize())
        throw new DeviceIdentityRefused({ reason: "reauthorizing" })
      }
    }
    return response
  }
}

/** Startup verifies a stable identity; an old/malformed session response grants no access to retained stores. */
export const readSession = (value: unknown): typeof SessionState.Type | undefined => {
  const state = Option.getOrUndefined(Schema.decodeUnknownOption(SessionState)(value))
  return state?.signedIn && state.personId === undefined ? undefined : state
}

export const readOwner = (text: string | null): DeviceOwner | undefined =>
  text === null ? undefined : Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(Owner))(text))

/** A bounded host handshake, timed only after preparation. A late receipt cannot reopen refused stores. */
export const activationGate = (withinMs: number, refused: (reason: "refused" | "timeout") => void, prepared?: Promise<void>) => {
  let state: "pending" | "retained" | "memory" = "pending"
  let resolve!: () => void
  const ready = new Promise<void>((done) => { resolve = done })
  const settle = (next: "retained" | "memory", reason: "refused" | "timeout" = "refused") => {
    if (state !== "pending") return false
    state = next
    clearTimeout(deadline)
    if (next === "memory") refused(reason)
    resolve()
    return true
  }
  let deadline: ReturnType<typeof setTimeout> | undefined
  const arm = () => {
    if (state === "pending") deadline = setTimeout(() => { settle("memory", "timeout") }, withinMs)
  }
  if (prepared === undefined) arm()
  else void prepared.then(arm, () => { settle("memory") })
  return { ready, state: () => state, allow: () => settle("retained"), refuse: () => settle("memory") }
}
