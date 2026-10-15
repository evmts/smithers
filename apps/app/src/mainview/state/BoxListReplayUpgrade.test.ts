import { digest } from "@smthrs/core/Digest"
import { afterEach, expect, test } from "bun:test"
import { ENVELOPE_STORAGE_KEY, parseStorageEnvelope } from "../chain/TransactionalStorage"
import { APP_PROJECTOR_VERSION, AppEventIntegrityError, appProjectionHash, initializeAppStream, normalizeAppProjection, replayAppEvents } from "./AppEventStream"
import { emptyAppProjection, type AppProjectionSnapshot } from "./AppProjection"
import { initialCloudSession } from "./AppState"
import { createAppStore, type AppStore } from "./AppStore"
import { canonicalEventValue } from "./EventValue"
import { memoryStorage } from "./TestFixtures"

/*
 * The production defect this pins (#3906): #3882 taught `workspaces.loaded`
 * to write `readyRevision` on the saved box-list row without moving
 * APP_PROJECTOR_VERSION. The field is optional, so every stored row still
 * PARSED — but an already-persisted `workspaces.loaded` event reprojected to
 * a different state than the one it had sealed, so replay refused the whole
 * saved stream and the app never opened:
 *
 *   AppEventIntegrityError: App event verification failed (projection).
 *
 * The version that wrote the bytes is the only thing that can decide this, so
 * the fixture below is the exact byte image of a pre-#3882 stream: one sealed
 * `workspaces.loaded` event whose state hash has no `readyRevision` in it.
 */
const PRE_READY_REVISION_VERSION = 35

const opened: AppStore[] = []
afterEach(async () => { for (const store of opened.splice(0)) await store.dispose?.() })
const open = async (storage: ReturnType<typeof memoryStorage>) => {
  const store = await createAppStore({ kind: "localStorage", storage })
  opened.push(store)
  return store
}
const seal = <T extends object>(domain: string, body: T) => ({ ...body,
  hash: digest(`smithers-app/${domain}/v1:` + canonicalEventValue(body)) })

/** The pre-#3882 projector left the box-list observation without a completed revision. */
const withoutReadyRevision = (snapshot: AppProjectionSnapshot): AppProjectionSnapshot => ({
  ...snapshot,
  cloudSessions: snapshot.cloudSessions.map(session => session.workspaceLists === undefined ? session : {
    ...session,
    workspaceLists: session.workspaceLists.map(({ readyRevision: _readyRevision, ...row }) => row)
  })
})

test("a saved box list from the projector before readyRevision reopens with its history", async () => {
  const storage = memoryStorage()
  const store = await open(storage)
  await store.dispatch({ type: "composer.changed", actor: "user", draft: "Keep my conversation" }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system",
    repositories: [{ id: "owner/repo", org: "owner", name: "repo", ownerKind: "user", head: null }] }).isPersisted.promise
  await store.compactEvents()
  // The one event every boot that lists boxes writes, and the one the old projector sealed.
  await store.dispatch({ type: "workspaces.loaded", actor: "system", workspaces: [{ id: "box", repoId: "owner/repo",
    name: "Box", targetBookmark: null, status: "running", provisioningStage: null, suspendedAt: null, createdAt: null }] }).isPersisted.promise
  const history = await store.eventHistory()
  expect(history.events).toHaveLength(1)
  expect(history.events[0]!.type).toBe("workspaces.loaded")
  const current = replayAppEvents(history.checkpoint, history.events, history.head)
  expect(current.snapshot.cloudSessions[0]?.workspaceLists?.[0]).toMatchObject({ scope: "*", phase: "ready" })
  expect(current.snapshot.cloudSessions[0]?.workspaceLists?.[0]?.readyRevision).toBeNumber()

  const oldFinalSnapshot = normalizeAppProjection(withoutReadyRevision(current.snapshot))
  const stateHash = appProjectionHash(oldFinalSnapshot)
  expect(stateHash).not.toBe(history.head.stateHash)
  const { hash: _checkpointHash, ...checkpointBody } = history.checkpoint
  const checkpoint = seal("checkpoint", { ...checkpointBody, projectorVersion: PRE_READY_REVISION_VERSION })
  const { hash: _eventHash, ...eventBody } = history.events[0]!
  const event = seal("event", { ...eventBody, projectorVersion: PRE_READY_REVISION_VERSION, stateHash })
  const head = { ...history.head, projectorVersion: PRE_READY_REVISION_VERSION, stateHash, eventHash: event.hash }
  await store.dispose?.(); opened.splice(opened.indexOf(store), 1)

  const envelope = parseStorageEnvelope(storage.getItem(ENVELOPE_STORAGE_KEY)!)!
  const rows = (values: ReadonlyArray<{ readonly id: string }>) => JSON.stringify(Object.fromEntries(values.map(data =>
    [`s:${data.id}`, { versionKey: "legacy-fixture", data }])))
  for (const [id, values] of [["app-events", [event]], ["app-event-heads", [head]], ["app-event-checkpoints", [checkpoint]],
    ["app-cloud-sessions", oldFinalSnapshot.cloudSessions], ["app-cloud-workspaces", oldFinalSnapshot.cloudWorkspaces]] as const) {
    envelope.entries[`smithers-mvp.${id}`] = rows(values)
  }
  storage.setItem(ENVELOPE_STORAGE_KEY, JSON.stringify(envelope))

  const restored = await open(storage)
  // Everything the saved stream held is still here; only the event log rotated.
  expect(restored.session().draft).toBe("Keep my conversation")
  expect(restored.collections.repositories.has("owner/repo")).toBe(true)
  expect(restored.collections.cloudWorkspaces.get("box")?.name).toBe("Box")
  expect(restored.collections.cloudSessions.get("cloud")?.workspaceLists?.[0]).toMatchObject({ scope: "*", phase: "ready" })
  const rotated = await restored.eventHistory()
  expect(rotated.checkpoint.reason).toBe("projector-upgrade")
  expect(rotated.head.projectorVersion).toBe(APP_PROJECTOR_VERSION)
  expect((await restored.verifyState()).valid).toBe(true)
})

test("a projector disagreement names its own stage, transition and position, and no row value", async () => {
  const storage = memoryStorage()
  const store = await open(storage)
  await store.dispatch({ type: "composer.changed", actor: "user", draft: "Private conversation text" }).isPersisted.promise
  await store.compactEvents()
  await store.dispatch({ type: "workspaces.loaded", actor: "system", workspaces: [{ id: "box", repoId: "owner/repo",
    name: "Private box name", targetBookmark: null, status: "running", provisioningStage: null, suspendedAt: null, createdAt: null }] }).isPersisted.promise
  const history = await store.eventHistory()
  // This build's projector disagrees with the one that sealed the row, at this version.
  const oldFinalSnapshot = normalizeAppProjection(withoutReadyRevision(
    replayAppEvents(history.checkpoint, history.events, history.head).snapshot))
  const stateHash = appProjectionHash(oldFinalSnapshot)
  const { hash: _eventHash, ...eventBody } = history.events[0]!
  const event = seal("event", { ...eventBody, stateHash })
  const head = { ...history.head, stateHash, eventHash: event.hash }
  await store.dispose?.(); opened.splice(opened.indexOf(store), 1)
  const envelope = parseStorageEnvelope(storage.getItem(ENVELOPE_STORAGE_KEY)!)!
  const rows = (values: ReadonlyArray<{ readonly id: string }>) => JSON.stringify(Object.fromEntries(values.map(data =>
    [`s:${data.id}`, { versionKey: "fixture", data }])))
  for (const [id, values] of [["app-events", [event]], ["app-event-heads", [head]]] as const) {
    envelope.entries[`smithers-mvp.${id}`] = rows(values)
  }
  storage.setItem(ENVELOPE_STORAGE_KEY, JSON.stringify(envelope))

  const refusal = await open(storage).then(() => undefined, (error: unknown) => error)
  expect(refusal).toBeInstanceOf(AppEventIntegrityError)
  const failure = refusal as AppEventIntegrityError
  expect(failure.reason).toBe("projection")
  expect(failure.detail).toEqual({ stage: "replay-state-hash", type: "workspaces.loaded", sequence: event.sequence })
  // Startup prints `message` behind Details, so the cause must be in it — and nothing else.
  expect(failure.message).toContain("stage=replay-state-hash type=workspaces.loaded")
  for (const secret of ["Private conversation text", "Private box name", stateHash, head.streamId]) {
    expect(failure.message).not.toContain(secret)
  }
})

/*
 * A zod issue's path walks INTO a `z.record`, and that segment is a key the
 * saved data chose — `transcriptAnchors` is keyed by an account/repo/branch
 * scope. Spelling it out would print saved data in the startup panel, so only
 * a name one of this module's schemas declares survives into the path.
 */
test("a refused field inside a record names the declared keys and masks the saved one", () => {
  const seeded = normalizeAppProjection(initializeAppStream(emptyAppProjection(), "stream", "created").snapshot)
  const scope = "github.com/private-owner/private-repo@secret-branch"
  const broken = { ...seeded, sessions: [{ ...seeded.sessions[0], transcriptAnchors: { [scope]: { scope, afterSequence: "not-a-number" } } }] }
  const refusal = (() => { try { normalizeAppProjection(broken) } catch (error) { return error } })()
  expect(refusal).toBeInstanceOf(AppEventIntegrityError)
  const failure = refusal as AppEventIntegrityError
  expect(failure.detail).toEqual({ stage: "snapshot-row-schema", collection: "sessions",
    path: "transcriptAnchors.*.afterSequence", code: "invalid_type" })
  expect(failure.message).not.toContain("private-owner")
  expect(failure.message).not.toContain("secret-branch")
})

test("a saved row this build cannot parse names its collection and field, never its value", () => {
  const seeded = normalizeAppProjection(initializeAppStream(emptyAppProjection(), "stream", "created").snapshot)
  const broken = { ...seeded, cloudSessions: [{ ...initialCloudSession(1), username: "private-login", expiresAt: 7 }] }
  const refusal = (() => { try { normalizeAppProjection(broken) } catch (error) { return error } })()
  expect(refusal).toBeInstanceOf(AppEventIntegrityError)
  const failure = refusal as AppEventIntegrityError
  expect(failure.detail).toEqual({ stage: "snapshot-row-schema", collection: "cloudSessions", path: "expiresAt", code: "invalid_type" })
  expect(failure.message).not.toContain("private-login")
})
