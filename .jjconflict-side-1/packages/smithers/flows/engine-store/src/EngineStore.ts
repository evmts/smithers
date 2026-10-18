/**
 * Durable `FlowEngine.Encoded` composition over `@smthrs/journal`.
 *
 * Governing designs: `docs/concepts/ownership-and-fencing.md`,
 * `docs/concepts/attempts-and-replay.md`, and
 * `packages/smithers/flows/flow/docs/concepts/flows-and-actions.md`.
 *
 * @since 0.1.0
 */

import * as CapabilitySet from "@smthrs/capability/CapabilitySet"
import { Sha256 } from "@smthrs/crypto"
import type { DurableWriter } from "@smthrs/database/DurableWriter"
import { FlowEngine } from "@smthrs/engine"
import { Action, Flow, FlowRuntime, Interpreter } from "@smthrs/flow"
import { FileBoundary } from "@smthrs/flow/FileBoundary"
import { Consensus, Journal, type JournalEvent } from "@smthrs/journal"
import { Jj } from "@smthrs/kernel"
import { AttemptStore, Ownership, RunStore } from "@smthrs/run-store"
import { CacheStore } from "@smthrs/step-cache"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import type * as Crypto from "effect/Crypto"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Metric from "effect/Metric"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import type * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as DurableEngineState from "./DurableEngineState.ts"
import * as EngineStoreMetrics from "./EngineStoreMetrics.ts"
import * as ActionPersistence from "./internal/ActionPersistence.ts"
import * as AttemptAdmission from "./internal/AttemptAdmission.ts"
import * as AttemptProbe from "./internal/AttemptProbe.ts"
import * as CacheAgeVerdicts from "./internal/CacheAgeVerdicts.ts"
import * as DeferredPersistence from "./internal/DeferredPersistence.ts"
import * as EngineJj from "./internal/EngineJj.ts"
import * as NodeJournal from "./internal/NodeJournal.ts"
import * as RunDriver from "./internal/RunDriver.ts"
import * as OwnerIdentity from "./OwnerIdentity.ts"
import * as ReplayOnly from "./ReplayOnly.ts"
import { RunState } from "./RunState.ts"
import * as StepBoundary from "./StepBoundary.ts"
import * as StepSandbox from "./StepSandbox.ts"
import * as WakeBus from "./WakeBus.ts"
import * as WorkspaceSandbox from "./WorkspaceSandbox.ts"

/**
 * Why the engine itself asked a parked execution to resume, as reported to
 * {@link Options.requestResume}.
 *
 * @since 1.0.0-rc.0
 * @category models
 */
export type RequestedResumeReason = RunDriver.RequestedResumeReason

/**
 * Who wakes the runs of an engine's store: a long-lived process, or a host
 * that drives one execution from outside. See {@link Options.sweep}.
 *
 * @since 1.0.0
 * @category models
 */
export type Sweep = RunDriver.Sweep

/**
 * What one {@link drive} left an execution as.
 *
 * - `Settled`: the run reached `status` and nothing will drive it again.
 * - `Parked`: it waits. `wakeAtMs` is when its host must drive it next, the
 *   earliest pending `DurableClock` or the instant another owner's claim or
 *   lease lapses; `undefined` when only an external completion, reported
 *   through `requestResume`, wakes it.
 * - `Unfinished`: it has work due now that this drive did not do, such as a
 *   run released when the store became unavailable mid-drive. Drive it again
 *   after a backoff.
 *
 * @since 1.0.0
 * @category hosting
 */
export type Driven =
  | { readonly _tag: "Settled"; readonly status: RunStore.TerminalRunStatus }
  | { readonly _tag: "Parked"; readonly wakeAtMs: number | undefined }
  | { readonly _tag: "Unfinished" }

/**
 * Drives one execution as far as it can go now, for a host that wakes it
 * from outside. See {@link drive}.
 *
 * @since 1.0.0
 * @category hosting
 */
export class Driver extends Context.Service<Driver, {
  readonly drive: (
    flow: Flow.Any,
    options: { readonly executionId: string; readonly payload: object }
  ) => Effect.Effect<Driven, FlowRuntime.FlowCycleDetected | RunStore.RunStoreError>
}>()("@smthrs/engine-store/EngineStore/Driver") {}

/**
 * Drives `executionId` once and reports what that left it as, without
 * waiting for it to settle.
 *
 * An execution the store does not hold yet is admitted with `payload` and
 * driven. One it holds is driven only if it has work due: a parked run whose
 * clock has not come due is left parked, without a replay. The drive claims
 * the run, or takes it from an earlier incarnation the host's `isAlive`
 * declares gone, replays what is recorded, and runs until the run settles or
 * parks. A drive that stopped without either, such as one released by an
 * unavailable store, reports `Unfinished`.
 *
 * A drive that finds the run `Settled`, and is the last round of its lineage,
 * records the wake of every parent still waiting on it again, without
 * scheduling a wake already recorded. So an invocation that died between the
 * settlement and those records loses no parent's wake: the next drive of the
 * settled run writes them.
 *
 * `flow` must be registered with the engine. Every engine the store composes
 * provides the {@link Driver}; it is meant for a `sweep: { host }` engine,
 * whose host arms its next invocation from the result.
 *
 * @since 1.0.0
 * @category hosting
 */
export const drive = (
  flow: Flow.Any,
  options: { readonly executionId: string; readonly payload: object }
): Effect.Effect<Driven, FlowRuntime.FlowCycleDetected | RunStore.RunStoreError, Driver> =>
  Effect.gen(function*() {
    const driver = yield* Driver
    return yield* driver.drive(flow, options)
  })

/**
 * Engine-store construction options.
 *
 * @since 0.1.0
 * @category models
 */
export interface Options {
  readonly owner: {
    readonly hostId: string
  }
  readonly journalSource: string
  /**
   * The directory a declaration path is recorded relative to.
   *
   * A node record can carry where its action was declared, and the path the
   * runtime reports is absolute. A journal is read on machines that did not
   * write it, so the absolute form is at best noise and at worst an
   * operator's home directory published into a run's history: the writer
   * strips this prefix, and omits the path entirely when it cannot.
   *
   * Defaults to the process working directory where there is one. A host
   * without a filesystem identity — a worker, a browser — passes nothing and
   * records no declaration paths at all, which is the honest answer.
   */
  readonly declarationRoot?: string | undefined
  /**
   * The revision of the tree this host read its flows out of.
   *
   * A node record can carry where its action was declared, and a path with a
   * line does not say which bytes were at that line: the tree moves, and the
   * same path after an edit is a different file. A host that can name the
   * revision it loaded from declares it here, and every recorded graph page
   * carries it, so a reader can open that file AT that revision.
   *
   * Absent by default, which is the honest answer for a host served out of
   * no version control or one that cannot name a revision holding what it
   * loaded. A reader with nothing shows no code rather than code it cannot
   * bind (D-068).
   *
   * A host that only learns the answer AFTER this store is built declares a
   * reader instead of a string, and it is asked once per recorded page. The
   * native host is one: the modules whose sites these records carry are read
   * during registration, which runs after this layer, so the revision that
   * describes them is not known when the store is composed. An answer that
   * is not a non-empty string records nothing, exactly as `undefined` does.
   */
  readonly sourceRevision?: string | (() => string | undefined) | undefined
  /**
   * Liveness arbitration consulted before this store steals a run whose lease
   * has expired. Answering `true` refuses the takeover.
   *
   * Optional. The default is `Ownership.leaseLiveness(heartbeatStaleAfter)`:
   * the owner is alive while its persisted heartbeat is younger than the
   * staleness cutoff, and gone once it is not. That is the weakest honest
   * answer and the one every host can give, so a composition that supplies
   * nothing still reclaims the runs of an owner killed with SIGKILL — the
   * steal it admits carries `lease-expired` evidence, which the run store
   * verifies against the row in the same write.
   *
   * A deployment that can say more supplies its own check and refuses the
   * takeover for longer: `Ownership.sameHostIncarnation` is the guard a local
   * `process.kill(pid, 0)` probe applies before reading `owner.pid`.
   *
   * A supplied check is also asked while the lease is still fresh, about an
   * owner on this host whose pid is not this process's. Answering `false`
   * there takes the run at once with `same-host-pid-dead` evidence, so a
   * rerun after `kill -9` does not wait out the dead owner's lease.
   */
  readonly isAlive?: Ownership.LivenessCheck | undefined
  /** Host routing, checked before claiming a run (including automatic wakes). */
  readonly canExecute?: ((row: RunStore.RunRow) => Effect.Effect<boolean>) | undefined
  /**
   * Read-only host admission fence, rechecked in the native activation transaction.
   * Use captured native reads and synchronous local probes only; external I/O
   * and module loading belong in `canExecute`.
   */
  readonly canActivate?: ((row: RunStore.RunRow) => Effect.Effect<boolean>) | undefined
  /**
   * Records, for a host that keeps one, that this engine has asked a parked
   * execution to resume: a durable clock fired, a durable deferred completed,
   * or a child settled under a parent that parked on it.
   *
   * A host that refuses to re-enter a parked run nobody asked for — the
   * control plane's executor does — reads the record to tell those wakes from
   * its own heartbeat sweep. Without it a run that slept never settled.
   *
   * Optional; a composition with no such host leaves it undefined.
   *
   * @since 1.0.0-rc.0
   */
  readonly requestResume?:
    | ((executionId: string, reason: RequestedResumeReason) => Effect.Effect<void>)
    | undefined
  /**
   * Redispatch policy for a durable clock whose fire failed. Defaults to
   * {@link DeferredPersistence.defaultFireRetryPolicy} — exponential from
   * 100ms, capped at 30s, forever. Same shape as the engine's
   * `suspendedRetryPolicy` option: the built-in behavior is the default, and
   * a deployment that wants a different backoff supplies one here rather than
   * patching the store.
   */
  readonly clockFireRetryPolicy?: Schedule.Schedule<unknown, unknown> | undefined
  /**
   * Who wakes this store's runs. Defaults to `"process"`.
   *
   * `"process"` suits a long-lived process. A fiber sweeps the store every
   * `Ownership.heartbeatInterval` for runs to wake or reclaim: parked runs
   * with a cancellation or a release, due timers, admitted runs nobody
   * drove, and running rows whose owner stopped renewing its lease. Every
   * owned round renews that lease on the same cadence, and registering a flow
   * re-arms the clocks and completions of every one of its runs.
   *
   * `{ host: executionId }` suits a host that drives one execution per
   * invocation and wakes it from outside, such as a Cloudflare Durable Object
   * alarm. No sweep runs and no lease is renewed, so the engine starts no
   * background work that outlives the invocation's own drive. Registering a
   * flow re-arms only that execution's clocks and completions. The host reads
   * {@link nextWake} to arm its next invocation, and its `isAlive` check, not
   * a lease, tells a crashed incarnation from a live one. Because the lease is
   * not renewed, every other engine sharing the store must route this
   * execution away with `canExecute`, or it reclaims the run once
   * `Ownership.heartbeatStaleAfter` passes.
   *
   * @since 1.0.0
   */
  readonly sweep?: Sweep | undefined
}

type PublicRequirements =
  | AttemptStore.AttemptStore
  | CacheStore.CacheStore
  // DECIDED (2026-08-11, pending review): hashing is a construction-time
  // requirement of this composition rather than a per-call one.
  // The run driver derives each trampoline round's execution id from
  // (lineage, ordinal) with the injected SHA-256, on the coordinator's own
  // fiber rather than a caller's, so hashing is a construction-time
  // requirement of the composition (`packages/smithers/flows/engine/docs/api.md`).
  | Crypto.Crypto
  | DurableEngineState.DurableEngineState
  | DurableWriter
  | Journal.Journal
  | Jj.Jj
  | OwnerIdentity.OwnerIdentity
  | RunStore.RunStore
  | Scope.Scope
  | StepBoundary.Service

type Requirements = PublicRequirements | EngineJj.EngineJj

const isBoundaryMetadata = Schema.is(FileBoundary)

/**
 * What the file boundary refuses a sealed attempt with: `StepSandbox` and
 * `StepBoundary` failures for a step that broke its declaration or a host that
 * cannot honour one. None of them is a failure the action declared.
 */
const BoundaryRefusal = Schema.Union([
  StepSandbox.UndeclaredRead,
  StepBoundary.UndeclaredWrite,
  StepBoundary.MissingDeclaredOutput,
  StepBoundary.SurvivingDeclaredRemoval,
  StepBoundary.UnsupportedBoundary,
  StepBoundary.BoundaryCorruption,
  StepBoundary.MissingArtifact
])

/**
 * Matches a boundary refusal and answers its encoded tagged fields (issue
 * #4019). A live refusal is a class instance; a replayed one is the fields its
 * failed attempt row persisted, decoded first so both settle as one value.
 */
const boundaryRefusal = (error: unknown): Result.Result<unknown, unknown> => {
  const encoded = Option.orElse(
    Schema.encodeUnknownOption(BoundaryRefusal)(error),
    () =>
      Option.flatMap(Schema.decodeUnknownOption(BoundaryRefusal)(error), Schema.encodeUnknownOption(BoundaryRefusal))
  )
  return Option.isSome(encoded) ? Result.succeed(encoded.value) : Result.fail(error)
}

/** Store failures are engine outcomes, independent of an action's error codec. */
const EngineError = Schema.Union([
  ActionPersistence.CacheConflictDetected,
  ActionPersistence.CacheCorruptionDetected,
  ActionPersistence.AttemptAdmissionRejected,
  WorkspaceSandbox.MaterializationConflict,
  WorkspaceSandbox.WorkspaceError
])
/** The stores an attempt's persistence writes through. */
const StorageErrors = [
  Journal.JournalError,
  AttemptStore.AttemptStoreError,
  RunStore.RunStoreError,
  CacheStore.CacheStoreError,
  Consensus.ConsensusError
] as const

/** The codes those stores fail with when the database did not answer. */
const unavailableCodes: ReadonlySet<string> = new Set(["sink_failed", "read_failed", "persistence_failed"])

/**
 * Whether a failure out of the attempt's persistence is the store being
 * unavailable: a lost connection, an I/O error, a database that is restarting.
 * Those are failures of the engine's own writes, never the action's outcome,
 * and they are transient. Only live store failures qualify: they are class
 * instances, while an action's own failure reaches this point encoded by its
 * error schema, so a body that happens to fail with one of these types is
 * never mistaken for one.
 */
const storageUnavailable = (error: unknown): error is InstanceType<typeof StorageErrors[number]> =>
  StorageErrors.some((type) => error instanceof type) &&
  unavailableCodes.has((error as InstanceType<typeof StorageErrors[number]>).code)

const encodeEngineError = (error: unknown): Option.Option<unknown> =>
  Option.orElse(
    Schema.encodeUnknownOption(EngineError)(error),
    () => Option.flatMap(Schema.decodeUnknownOption(EngineError)(error), Schema.encodeUnknownOption(EngineError))
  )

/**
 * Constructs the production encoded composition.
 *
 * Registrations and active fibers are scoped in memory. Run identity, encoded
 * payload, results, deferred completions, clocks, actions, and ownership
 * are persisted by the supplied layers. Supply the same DurableWriter used
 * by the journal and run store so cancellation can retain complete failures.
 * The capability ceiling current at construction is the engine's host
 * ceiling: every run it admits records it, and every join, poll, and resume
 * is compared under it, whichever context later calls the service.
 *
 * @since 0.1.0
 * @category constructors
 */
const makeWithEngineJj = (
  options: Options
): Effect.Effect<
  { readonly runtime: FlowRuntime.FlowRuntime["Service"]; readonly driver: Driver["Service"] },
  never,
  Requirements
> =>
  Effect.gen(function*() {
    const host = yield* CapabilitySet.current
    const ownerIdentity = yield* OwnerIdentity.OwnerIdentity
    const owner = yield* ownerIdentity.ownerId(options.owner.hostId)
    // One admission mutex per incarnation, shared by every dispatch this
    // store drives: `ActionPersistence.make` runs per dispatch below, so a
    // per-make default would never contend and the same-key exclusion the
    // adoption evidence rests on (issues #102, #103) would silently vanish.
    const admission = AttemptAdmission.makeUnsafe()
    // Run instances own the projection's lifetime, including nested actions.
    // A resumed instance rebuilds it without retaining completed runs here.
    const ageVerdicts = new WeakMap<FlowRuntime.FlowInstance["Service"], ReturnType<typeof CacheAgeVerdicts.make>>()
    const attemptStore = yield* AttemptStore.AttemptStore
    const cacheStore = yield* CacheStore.CacheStore
    const journal = yield* Journal.Journal
    const declarationRoot = NodeJournal.hostRoot(options.declarationRoot)
    /*
     * Stated by the host or not at all; nothing here derives a revision. A
     * reader is asked where the record is written rather than here, because a
     * host that learns its revision after this layer builds would otherwise
     * be captured before it knows the answer.
     */
    const declaredRevision = options.sourceRevision
    const sourceRevision = (): string | undefined => {
      const answer = typeof declaredRevision === "function" ? declaredRevision() : declaredRevision
      return typeof answer === "string" && answer.length > 0 ? answer : undefined
    }
    const actionJj = yield* Jj.Jj
    const engineJj = yield* EngineJj.EngineJj
    const runStore = yield* RunStore.RunStore
    const forkOrigins = new WeakMap<FlowRuntime.FlowInstance["Service"], ReadonlyArray<string>>()
    const keyOrigins = Effect.fnUntraced(function*(instance: FlowRuntime.FlowInstance["Service"]) {
      const cached = forkOrigins.get(instance)
      if (cached !== undefined) return cached
      const row = yield* runStore.get(instance.executionId).pipe(Effect.orDie)
      const state = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(RunState))(row.stateJson).pipe(Effect.orDie)
      const origins = state.forkKeyRunIds ?? []
      forkOrigins.set(instance, origins)
      return origins
    })
    // Run instances bound cache lifetime; each producer has independent provenance.
    type PlanProvenance = { readonly lineageId: string; readonly sourceRevision: string | undefined }
    /** A plan row this run already holds: its provenance and what it says. */
    type RecordedPlan = { readonly provenance: PlanProvenance; readonly payload: Readonly<Record<string, unknown>> }
    const recordedPlans = new WeakMap<
      FlowRuntime.FlowInstance["Service"],
      Map<string, Effect.Effect<RecordedPlan | undefined>>
    >()
    /*
     * Plans a resume found recorded by an earlier build: the same plan, read
     * from other declaration sites. The first build's pages stand whole, so
     * the rebuilt pages, whose sites and layout may differ, are not appended.
     */
    const recordedByEarlierBuild = new WeakMap<FlowRuntime.FlowInstance["Service"], Set<string>>()
    /** Every page of one plan shares the source id before its page index. */
    const planOf = (sourceId: string) => sourceId.slice(0, sourceId.lastIndexOf("/"))
    const recordedPlan = Effect.fnUntraced(function*(
      instance: FlowRuntime.FlowInstance["Service"],
      sourceId: string
    ) {
      const root = FlowEngine.Lineage.root(instance.executionId)
      let producers = recordedPlans.get(instance)
      if (producers === undefined) {
        producers = new Map()
        recordedPlans.set(instance, producers)
      }
      let lookup = producers.get(sourceId)
      if (lookup === undefined) {
        lookup = yield* Effect.cached(Effect.gen(function*() {
          const origins = yield* keyOrigins(instance)
          let after: JournalEvent.Seq | undefined
          while (true) {
            const page = yield* journal.entries({
              runId: instance.executionId as JournalEvent.RunId,
              eventTypes: ["flows.engine.plan-recorded"],
              limit: 256,
              ...(after === undefined ? {} : { after })
            }).pipe(Effect.orDie)
            const inherited = page.entries.find((entry) => entry.sourceId === sourceId && entry.sourceSeq === 0)
            if (inherited !== undefined) {
              const meta = Schema.decodeUnknownOption(Schema.Struct({ lineageId: Schema.String }))(inherited.meta)
              const payload = Schema.decodeUnknownOption(
                Schema.Struct({ graph: Schema.Struct({ sourceRevision: Schema.optional(Schema.String) }) })
              )(inherited.payload)
              // Legacy or malformed rows still reach content deduplication and
              // its typed plan_changed refusal, rather than dying in the decoder.
              if (Option.isNone(meta) || Option.isNone(payload)) return undefined
              const { lineageId } = meta.value
              if (
                lineageId !== root && !origins.some((origin) => FlowEngine.Lineage.root(origin) === lineageId)
              ) return undefined
              return {
                provenance: { lineageId, sourceRevision: payload.value.graph.sourceRevision },
                // The decode above proved it an object; the raw row keeps every member.
                payload: inherited.payload as Readonly<Record<string, unknown>>
              }
            }
            if (!page.hasMore) return undefined
            after = page.entries[page.entries.length - 1]!.seq
          }
        }))
        producers.set(sourceId, lookup)
      }
      return yield* lookup
    })
    // A resumed or copied plan keeps its original source revision, even when
    // coding changes the workspace.
    const planProvenance = Effect.fnUntraced(function*(
      instance: FlowRuntime.FlowInstance["Service"],
      record: FlowRuntime.NodeRecord
    ) {
      const current = { lineageId: FlowEngine.Lineage.root(instance.executionId), sourceRevision: sourceRevision() }
      if (record._tag !== "PlanRecorded") return current
      // A missing row does not pin the revision of a size measurement. The
      // successful first write below replaces this cached absence.
      return (yield* recordedPlan(instance, `${options.journalSource}/${record.sourceId}`))?.provenance ?? current
    })
    /*
     * The journal refused a plan record because its slot holds other bytes.
     * Only the plan's identity decides what that means (NodeJournal.planIdentity):
     * the same plan from a build whose declarations moved resumes under the
     * row already written, and anything else is a changed plan.
     */
    const rebuiltPlan = (
      instance: FlowRuntime.FlowInstance["Service"],
      record: FlowRuntime.PlanRecorded,
      rebuilt: Readonly<Record<string, unknown>>
    ) => {
      const sourceId = `${options.journalSource}/${record.sourceId}`
      return Effect.flatMap(recordedPlan(instance, sourceId), (recorded) => {
        if (recorded === undefined || !NodeJournal.samePlan(recorded.payload, rebuilt)) {
          return Effect.fail(
            new Interpreter.InterpreterError({
              code: "plan_changed",
              flow: record.flow,
              node: "root",
              message: "The rebuilt plan differs from the recorded plan; start a new execution"
            })
          )
        }
        let plans = recordedByEarlierBuild.get(instance)
        if (plans === undefined) {
          plans = new Set()
          recordedByEarlierBuild.set(instance, plans)
        }
        plans.add(planOf(sourceId))
        return Effect.logDebug("engine-store: resuming under a plan an earlier build recorded", {
          runId: instance.executionId,
          flow: record.flow,
          sourceId
        })
      })
    }
    const stepBoundary = yield* StepBoundary.StepBoundary
    /**
     * Both halves of the isolated-execution lane are OPTIONAL and resolved
     * here, at composition time, for the same reason every service above is:
     * `actionExecute` runs on the engine's fiber, which does not carry the
     * store's layer context, so anything the dispatch needs has to be captured
     * now and re-provided below. A composition without a sandbox keeps the
     * pre-existing behaviour — the body runs against the host directly — and
     * one without a dispatcher journals what a transaction queued without
     * sending it.
     */
    const workspaceSandbox = yield* Effect.serviceOption(WorkspaceSandbox.WorkspaceSandbox)
    const stepSandbox = yield* Effect.serviceOption(StepSandbox.StepSandbox)
    const effectDispatcher = yield* Effect.serviceOption(WorkspaceSandbox.EffectDispatcher)
    // Resolved at composition like the sandboxes: a verifier composes an
    // engine that replays and executes nothing (`ReplayOnly`).
    const replayOnly = Option.getOrUndefined(yield* Effect.serviceOption(ReplayOnly.ReplayOnly))
    // Verification observes current code over copied history. Its plan is a
    // separate producer's immutable observation, never a replacement of the
    // executing producer's approved plan. ReplayOnly still refuses every new action.
    const observation = (record: FlowRuntime.NodeRecord): FlowRuntime.NodeRecord =>
      replayOnly === undefined ? record : { ...record, sourceId: `replay-only/${record.sourceId}` }
    const engineState = yield* DurableEngineState.DurableEngineState
    const attemptSurvivors = engineState.attemptSurvivors
    /**
     * Resolved like the sandbox lane above: OPTIONAL, at composition time. A
     * host that provides `WakeBus.layer` shares one bus between this engine
     * and its own wake sources; a composition given none builds a private
     * bus, which is complete for the in-process seam because every wake
     * source below (driver, deferred persistence) publishes through it.
     */
    const providedWakeBus = yield* Effect.serviceOption(WakeBus.WakeBus)
    const wakeBus = Option.getOrElse(providedWakeBus, WakeBus.makeUnsafe)

    const engine = yield* Deferred.make<FlowRuntime.FlowRuntime["Service"]>()
    const driver = yield* RunDriver.make({
      owner,
      journalSource: options.journalSource,
      isAlive: options.isAlive,
      canExecute: options.canExecute,
      canActivate: options.canActivate,
      requestResume: options.requestResume,
      engine: Deferred.await(engine),
      wakeBus,
      sweep: options.sweep
    })
    // The one execution a hosted store's registration recovers, if any.
    const hostedExecution = typeof options.sweep === "object" ? options.sweep.host : undefined
    const deferred = yield* DeferredPersistence.make({
      owner,
      journalSource: options.journalSource,
      scheduleResume: (flowName, executionId, reason, sourceId) =>
        driver.scheduleResume(flowName, executionId, reason, sourceId),
      fireRetryPolicy: options.clockFireRetryPolicy
    })

    const actionExecute = Effect.fn("FlowEngine.actionExecute")(function*(input: FlowEngine.ActionExecuteOptions) {
      const parent = yield* FlowRuntime.FlowInstance
      let cacheAgeVerdict = ageVerdicts.get(parent)
      if (cacheAgeVerdict === undefined) {
        cacheAgeVerdict = CacheAgeVerdicts.make(parent.executionId)
        ageVerdicts.set(parent, cacheAgeVerdict)
      }
      yield* Effect.annotateCurrentSpan({
        runId: parent.executionId,
        action: input.action.name,
        // `stepKey`, never `key`. `@smthrs/journal`'s redaction replaces the
        // value of any field whose name is a standalone trailing `key` word,
        // and `RedactedLogger` applies that rule to every log line this
        // package emits under a real host. A field named `key` reached the
        // operator as `[REDACTED]`, destroying the one field that says which
        // dispatch the line describes. The span carries the same name so the
        // trace and the log agree.
        stepKey: input.key,
        attempt: input.attempt,
        tier: input.tier
      })
      const instance = FlowEngine.makeInstance(
        parent.flow,
        parent.executionId
      )
      ageVerdicts.set(instance, cacheAgeVerdict)
      const flowEngine = yield* Deferred.await(engine)
      instance.interrupted = parent.interrupted
      // DECIDED (2026-08-11, pending review): the waiting classification is
      // threaded through the dispatch's instance and back, because the dispatch
      // runs under an instance of its own while `annotateWaiting` is documented
      // to reach the parked row. An implementation that declares one — `Sleep`
      // under `timer`, `WaitFor` under `event` with its wake token — writes it
      // here, so without the thread-back `RunDriver` would park on the derived
      // default and an action's declaration would be inert. It is seeded as
      // well as copied back so a body that annotated before dispatching keeps
      // its own declaration, and so the consumption `deferredResult` performs
      // on a settled wait travels out the same way (issue #42).
      const waitingBefore = parent.waiting
      instance.waiting = waitingBefore
      const logContext = {
        runId: parent.executionId,
        action: input.action.name,
        stepKey: input.key,
        attempt: input.attempt,
        tier: input.tier
      }
      yield* Effect.logTrace("action dispatch started", logContext)
      // The boundary preparation runs under the dispatching parent, not the
      // action's own instance, exactly as the engine would run it itself.
      const snapshot = input.snapshot === undefined
        ? undefined
        : Effect.provideContext(input.snapshot, yield* Effect.context<FlowRuntime.FlowInstance | Crypto.Crypto>())
      const result = yield* ActionPersistence.make({
        runId: parent.executionId,
        owner,
        sourceId: options.journalSource,
        isAlive: options.isAlive,
        engineJj,
        execute: (actionInput) => (actionInput.action as Action.Any).executeEncoded as Effect.Effect<unknown, unknown>,
        idempotencyKey: input.action.idempotencyKey === undefined
          ? undefined
          : input.key,
        admission,
        cacheAgeVerdict,
        replayOnly
      })({
        action: input.action,
        attempt: input.attempt,
        key: input.key,
        tier: input.tier,
        ...(input.nondeterministic === undefined ? {} : { nondeterministic: input.nondeterministic }),
        ...(isBoundaryMetadata(input.metadata)
          ? { metadata: input.metadata }
          : {}),
        ...(snapshot === undefined ? {} : { snapshot })
      }).pipe(
        // This is an engine safety refusal, not a failure declared by the
        // action. Keep it on the defect channel like the numbered-retry
        // guard in FlowEngine, before the action's error codec can mask it.
        Effect.catchIf(
          (cause): cause is Action.IrreversibleRetryRequiresIdempotencyKey =>
            cause instanceof Action.IrreversibleRetryRequiresIdempotencyKey,
          // Encode the tagged fields before the generic defect codec reduces
          // an Error instance to just its name and message.
          (cause) => Effect.die(Schema.encodeSync(Action.IrreversibleRetryRequiresIdempotencyKey)(cause))
        ),
        // A boundary refusal is the engine's verdict on the step, not the
        // action's error, so it takes the same defect channel. Decoded through
        // the action's error schema it became "SchemaError: Expected never"
        // and lost the refused paths.
        Effect.catchFilter(boundaryRefusal, Effect.die),
        // The store went away while this attempt was admitted, run or
        // recorded. Its outcome is not the action's: whatever did not commit
        // left the attempt row running, so the dispatch interrupts itself, as
        // it does on a lost fence, and the run is released for a later drive
        // that adopts the attempt and records its result.
        Effect.catchIf(storageUnavailable, (error) =>
          Effect.annotateCurrentSpan({ outcome: "storage_unavailable" }).pipe(
            Effect.andThen(Effect.logWarning("action attempt interrupted: the engine store is unavailable")),
            Effect.annotateLogs({ ...logContext, error: error._tag, code: error.code }),
            Effect.andThen(Metric.update(EngineStoreMetrics.storageUnavailable, 1)),
            Effect.andThen(Effect.interrupt)
          )),
        Flow.intoResult,
        Effect.provideService(FlowRuntime.FlowInstance, instance),
        Effect.provideService(
          FlowRuntime.FlowRuntime,
          flowEngine
        ),
        Effect.provideService(AttemptStore.AttemptStore, attemptStore),
        Effect.provideService(CacheStore.CacheStore, cacheStore),
        Effect.provideService(Journal.Journal, journal),
        Effect.provideService(Jj.Jj, actionJj),
        Effect.provideService(RunStore.RunStore, runStore),
        Effect.provideService(StepBoundary.StepBoundary, stepBoundary),
        (dispatch) =>
          Option.isNone(stepSandbox)
            ? dispatch
            : Effect.provideService(dispatch, StepSandbox.StepSandbox, stepSandbox.value),
        (dispatch) =>
          Option.isNone(workspaceSandbox)
            ? dispatch
            : Effect.provideService(dispatch, WorkspaceSandbox.WorkspaceSandbox, workspaceSandbox.value),
        (dispatch) =>
          Option.isNone(effectDispatcher)
            ? dispatch
            : Effect.provideService(dispatch, WorkspaceSandbox.EffectDispatcher, effectDispatcher.value),
        Effect.ensuring(Effect.sync(() => {
          if (parent.waiting === waitingBefore) parent.waiting = instance.waiting
        }))
      )
      const outcome = result._tag === "Complete"
        ? result.exit._tag === "Success" ? "success" : "failure"
        : result._tag.toLowerCase()
      yield* Effect.annotateCurrentSpan({ outcome })
      yield* Effect.logTrace("action dispatch settled", { ...logContext, outcome })
      return result
    })

    const encoded: FlowEngine.Encoded = {
      encodeEngineError,

      // Unspanned here: `driver.register` already opens the
      // `FlowEngine.register` span, and a second identical wrapper would nest
      // two same-name spans around one operation.
      register: (flow, execute) =>
        driver.register(flow, execute).pipe(
          Effect.tap(() => deferred.sweepDue(flow._tag, hostedExecution))
        ),
      execute: driver.execute,
      poll: driver.poll,
      interrupt: driver.interrupt,
      // The driver's refusal, forwarded rather than re-implemented: the
      // durable engine has one cancellation path, so `interruptUnsafe` fails
      // with `unsafe_interrupt_unsupported` here too (the release policy).
      interruptUnsafe: driver.interruptUnsafe,
      resume: driver.resume,
      actionExecute,
      /**
       * The graph a walk drove, and how each of its nodes settled.
       *
       * Addressed by the record's own `sourceId` rather than a minted one, so
       * a resumed walk writes the identities the first walk used and the
       * journal's `(run, source, sequence)` uniqueness holds one row per node
       * instead of one per observation. A `Duplicate` receipt is that
       * collapse happening, and it is the expected answer on a resume.
       *
       * A plan record is the exception to byte equality: a resume compares it
       * by identity, without declaration sites or page layout, so a rebuilt
       * bundle resumes and a changed plan fails with `plan_changed`.
       *
       * On the durable, owner-fenced channel, like every other engine record:
       * a writer that lost the run self-interrupts rather than narrating a
       * walk it no longer owns.
       */
      nodeRecordBytes: (input) => {
        const record = observation(input)
        return Effect.flatMap(FlowRuntime.FlowInstance, (parent) =>
          Effect.map(planProvenance(parent, record), (provenance) =>
            NodeJournal.encodedBytes({
              runId: parent.executionId,
              sourceId: options.journalSource,
              ...provenance,
              root: declarationRoot
            }, record)))
      },
      recordNode: (input) => {
        const record = observation(input)
        return Effect.flatMap(FlowRuntime.FlowInstance, (parent) => {
          if (
            record._tag === "SubgraphAppended" &&
            recordedByEarlierBuild.get(parent)?.has(planOf(`${options.journalSource}/${record.sourceId}`))
          ) {
            return Effect.void
          }
          return Effect.flatMap(planProvenance(parent, record), (provenance) => {
            const entry = NodeJournal.entry({
              runId: parent.executionId,
              sourceId: options.journalSource,
              ...provenance,
              root: declarationRoot
            }, record)
            // Every node record is built as an object, so its payload is one.
            const payload = entry.payload as Readonly<Record<string, unknown>>
            return journal.emitDurable(entry, owner).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  if (record._tag === "PlanRecorded") {
                    recordedPlans.get(parent)?.set(
                      `${options.journalSource}/${record.sourceId}`,
                      Effect.succeed({ provenance, payload })
                    )
                  }
                })
              ),
              Effect.catch((error) =>
                error.code === "fence_lost" ?
                  Effect.interrupt :
                  error.code === "idempotency_conflict" && record._tag === "PlanRecorded"
                  ? rebuiltPlan(parent, record, payload)
                  : Effect.die(error)
              ),
              Effect.asVoid
            )
          })
        })
      },
      actionReplayKey: Effect.fnUntraced(function*(derive) {
        const instance = yield* FlowRuntime.FlowInstance
        const origins = yield* keyOrigins(instance)
        if (origins.length === 0) {
          return yield* derive(instance.executionId, false)
        }
        // Prefer this child's own work on resume, then only ancestor keys
        // backed by attempts copied into this child. Never read parent rows.
        const probed = new Set<string>()
        for (const runId of [instance.executionId, ...origins]) {
          for (const runScoped of [true, false]) {
            const key = yield* derive(runId, runScoped)
            if (probed.has(key)) {
              continue
            }
            probed.add(key)
            const digest = yield* Schema.decodeUnknownEffect(Sha256)(key).pipe(Effect.orDie)
            const found = yield* AttemptProbe.probeAttempts(
              attemptStore,
              attemptSurvivors,
              instance.executionId,
              digest
            )
            if (Option.isSome(found)) {
              return key
            }
          }
        }
        return yield* derive(instance.executionId, true)
      }),
      // The durable schedule-to-close origin (issue #45): the first
      // attempt's persisted `startedAtMs` for the action key. It lives in
      // the same `flows_attempts` rows that already restore the attempt
      // sequence across park/resume and process death, so the engine's
      // `expirationMs` budget is measured from the true first attempt
      // instead of restarting on every process.
      actionRetryOrigin: Effect.fnUntraced(function*(input: {
        readonly key: string
      }) {
        const parent = yield* FlowRuntime.FlowInstance
        const survivors = yield* AttemptProbe.probeAttempts(
          attemptStore,
          attemptSurvivors,
          parent.executionId,
          yield* Schema.decodeUnknownEffect(Sha256)(input.key).pipe(Effect.orDie)
        )
        return Option.map(survivors, ({ earliestStartedAtMs }) =>
          earliestStartedAtMs)
      }),
      // The durable attempt counter (issue #59): the highest contiguous
      // persisted attempt for the key, so a resumed run replays failed
      // attempts under their original numbers instead of restarting at 1 —
      // the persisted failure is rethrown by `ActionPersistence`, the
      // retry decision sees the true attempt count, and the backoff ladder
      // is not re-slept.
      actionLatestAttempt: Effect.fnUntraced(function*(input: {
        readonly key: string
      }) {
        const parent = yield* FlowRuntime.FlowInstance
        const survivors = yield* AttemptProbe.probeAttempts(
          attemptStore,
          attemptSurvivors,
          parent.executionId,
          yield* Schema.decodeUnknownEffect(Sha256)(input.key).pipe(Effect.orDie)
        )
        return Option.map(survivors, ({ latest }) =>
          latest)
      }),
      // The durable restore-before-retry handle (issue #1805): the earliest
      // boundary snapshot persisted in the key's surviving attempt rows, so a
      // restarted process restores the original pre-image before a retry.
      actionSnapshot: Effect.fnUntraced(function*(input: {
        readonly key: string
      }) {
        const parent = yield* FlowRuntime.FlowInstance
        const stepKeyDigest = yield* Schema.decodeUnknownEffect(Sha256)(input.key).pipe(Effect.orDie)
        const survivors = yield* AttemptProbe.probeAttempts(
          attemptStore,
          attemptSurvivors,
          parent.executionId,
          stepKeyDigest
        )
        if (Option.isNone(survivors)) {
          return Option.none()
        }
        return yield* ActionPersistence.earliestBoundarySnapshot(attemptStore, parent.executionId, stepKeyDigest, {
          earliest: survivors.value.earliestAttempt,
          latest: survivors.value.latest
        })
      }),
      deferredResult: deferred.deferredResult,
      deferredDone: deferred.deferredDone,
      deferredDoneIfWaiting: deferred.deferredDoneIfWaiting,
      scheduleClock: deferred.scheduleClock,
      // The engine races this against its suspension backoff sleep, so an
      // IN-PROCESS wake — deferred completed, clock fired, operator resume,
      // run settled — resumes the waiting caller immediately, with the
      // polling schedule as the bounded fallback. The bus is edge-triggered
      // and miss-tolerant (`WakeBus.ts`); a wake published before the caller
      // re-subscribes only costs one poll interval. Cross-process wakes ride
      // the polling schedule and the heartbeat sweeps: the bus is in-process,
      // and the journal offers no committed cross-process subscription.
      resumeSignal: (_flow, executionId) => wakeBus.awaitWake(executionId)
    }
    const service = {
      ...FlowEngine.bindHostCeiling(host, FlowEngine.makeUnsafe(encoded)),
      durability: "durable" as const
    }
    yield* Deferred.succeed(engine, service)

    /** What the store says the execution is now, for its host. */
    const driven = (executionId: string) =>
      Effect.gen(function*() {
        const row = yield* runStore.get(executionId)
        if (RunStore.isTerminalRunStatus(row.status)) {
          return { _tag: "Settled", status: row.status } as const
        }
        const wake = yield* nextWake(executionId).pipe(
          Effect.provideService(RunStore.RunStore, runStore),
          Effect.provideService(DurableEngineState.DurableEngineState, engineState)
        )
        const nowMs = Math.floor(yield* Clock.currentTimeMillis)
        return Option.isSome(wake) && wake.value <= nowMs
          ? { _tag: "Unfinished" } as const
          : { _tag: "Parked", wakeAtMs: Option.getOrUndefined(wake) } as const
      })
    const hostDriver = Driver.of({
      // Compared under the host ceiling, as every call of the typed service is.
      drive: Effect.fn("EngineStore.drive")(function*(flow, input) {
        yield* Effect.annotateCurrentSpan({ executionId: input.executionId, flow: flow._tag })
        const admitted = yield* runStore.get(input.executionId).pipe(
          Effect.as(true),
          Effect.catchIf((error) => error.code === "not_found_row", () => Effect.succeed(false))
        )
        // A drive that ends on a lost fence or an unavailable store interrupts
        // itself and releases the run; the store, read below, says what is
        // left. Any other failure is the caller's.
        const exit = yield* Effect.exit(
          admitted
            ? driver.resume(flow, input.executionId, { poll: true })
            : driver.execute(flow, { executionId: input.executionId, payload: input.payload, discard: false })
        )
        if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) return yield* Effect.failCause(exit.cause)
        const outcome = yield* driven(input.executionId)
        if (outcome._tag === "Settled") yield* driver.reannounce(input.executionId)
        yield* Effect.annotateCurrentSpan({ outcome: outcome._tag })
        return outcome
      }, CapabilitySet.attenuateGroups(host.groups))
    })
    return { runtime: service, driver: hostDriver }
  })

/**
 * Constructs the production encoded composition using the ambient `Jj` for
 * both public action access and private engine bookkeeping.
 *
 * @since 0.1.0
 * @category constructors
 */
export const make = (
  options: Options
): Effect.Effect<FlowRuntime.FlowRuntime["Service"], never, PublicRequirements> =>
  Effect.gen(function*() {
    const jj = yield* Jj.Jj
    return (yield* makeWithEngineJj(options).pipe(
      Effect.provideService(EngineJj.EngineJj, jj)
    )).runtime
  })

/**
 * Provides the durable flow engine.
 *
 * @since 0.1.0
 * @category layers
 */
const layerBase = (
  options: Options
): Layer.Layer<
  FlowEngine.SnapshotBoundary | FlowRuntime.FlowRuntime | Driver,
  never,
  Requirements
> => {
  const snapshotBoundary = Layer.effect(
    FlowEngine.SnapshotBoundary,
    Effect.map(EngineJj.EngineJj, (jj) =>
      FlowEngine.SnapshotBoundary.of({
        snapshot: Effect.fn("SnapshotBoundary.snapshot")(({ key, attempt }) =>
          Effect.annotateCurrentSpan({ stepKey: key, attempt }).pipe(
            Effect.andThen(jj.snapshot(`smithers action ${key} attempt ${attempt}`)),
            Effect.orDie,
            // The commit id, never the change id: an agent's `jj squash` in the
            // step rewrites the change, and a change id would then name the
            // step's edits instead of the pre-image.
            Effect.map((snapshot) => snapshot.commitId)
          )
        ),
        restore: Effect.fn("SnapshotBoundary.restore")((snapshot) =>
          Effect.annotateCurrentSpan({ snapshot: String(snapshot) }).pipe(
            Effect.andThen(jj.restore(snapshot as never)),
            Effect.orDie
          )
        ),
        diff: Effect.fn("SnapshotBoundary.diff")((snapshot, { key, attempt }) =>
          Effect.annotateCurrentSpan({ stepKey: key, attempt }).pipe(
            Effect.andThen(jj.snapshot(`smithers action ${key} attempt ${attempt} settled`)),
            Effect.orDie,
            Effect.flatMap((current) => jj.diff(snapshot as never, current.commitId).pipe(Effect.orDie))
          )
        )
      }))
  )
  return Layer.merge(
    Layer.effectContext(Effect.map(
      makeWithEngineJj(options),
      ({ driver, runtime }) => Context.make(FlowRuntime.FlowRuntime, runtime).pipe(Context.add(Driver, driver))
    )),
    snapshotBoundary
  )
}

/**
 * Provides the durable engine using the ambient `Jj` for both action and
 * engine contexts. Host compositions that guard action access should use
 * {@link layerWithPrivilegedJj} instead.
 *
 * @since 0.1.0
 * @category layers
 */
export const layer = (
  options: Options
): Layer.Layer<FlowEngine.SnapshotBoundary | FlowRuntime.FlowRuntime | Driver, never, PublicRequirements> =>
  layerBase(options).pipe(Layer.provide(EngineJj.layerFromJj))

/**
 * Provides the durable engine with a private repository implementation for
 * engine bookkeeping while retaining ambient `Jj` for action bodies.
 *
 * @since 1.0.0
 * @category layers
 */
export const layerWithPrivilegedJj = <E, R>(
  options: Options,
  privilegedJj: Layer.Layer<Jj.Jj, E, R>
): Layer.Layer<
  FlowEngine.SnapshotBoundary | FlowRuntime.FlowRuntime | Driver,
  E,
  PublicRequirements | R
> =>
  layerBase(options).pipe(
    Layer.provide(EngineJj.layerFromJj.pipe(Layer.provide(privilegedJj)))
  )

/**
 * When the host of a `sweep: { host }` store must next drive `executionId`, in
 * epoch milliseconds.
 *
 * A hosted store runs no sweep, so nothing wakes a parked execution unless its
 * host arms the next invocation for this instant:
 *
 * - `Option.none()`: nothing will wake the execution by itself. It settled, it
 *   does not exist, it is quarantined until an operator resumes it, or it is
 *   parked on an external event whose completion has not arrived. The writer
 *   of that completion reports it through `requestResume`.
 * - `Option.some(at)` with `at` at or before now: there is work now. A
 *   completion or a clock is due and not yet consumed, a cancellation was
 *   requested, the run was released by an interrupted drive, or it was
 *   admitted and never driven.
 * - `Option.some(at)` later than now: the earliest pending `DurableClock` of a
 *   parked execution, or the instant another owner's claim or lease lapses,
 *   when another owner holds the run.
 *
 * @since 1.0.0
 * @category hosting
 */
export const nextWake = Effect.fn("EngineStore.nextWake")(function*(executionId: string) {
  const runs = yield* RunStore.RunStore
  const state = yield* DurableEngineState.DurableEngineState
  const nowMs = Math.floor(yield* Clock.currentTimeMillis)
  const staleAfterMs = Duration.toMillis(Ownership.heartbeatStaleAfter)
  const row = yield* runs.get(executionId).pipe(
    Effect.map(Option.some),
    Effect.catchIf((error) => error.code === "not_found_row", () => Effect.succeedNone)
  )
  if (Option.isNone(row) || RunStore.isTerminalRunStatus(row.value.status)) return Option.none<number>()
  const run = row.value
  // A claim another owner holds is taken only once it is stale.
  if (run.claimedAtMs !== null) return Option.some(Math.max(nowMs, run.claimedAtMs + staleAfterMs))
  if (run.status === "running") return Option.some(Math.max(nowMs, run.heartbeatAtMs! + staleAfterMs))
  if (run.status === "pending" || run.cancelRequestedAtMs !== null) return Option.some(nowMs)
  const waiting = yield* state.waiting(executionId)
  if (Option.isSome(waiting) && waiting.value.reason === "quarantine") return Option.none<number>()
  if (Option.isSome(waiting) && waiting.value.reason === "released") return Option.some(nowMs)
  if (yield* state.hasDueWake(executionId, nowMs)) return Option.some(nowMs)
  const clocks = yield* state.pendingClocks({ executionId })
  return clocks.length === 0 ? Option.none<number>() : Option.some(clocks[0]!.dueAtMs)
})
