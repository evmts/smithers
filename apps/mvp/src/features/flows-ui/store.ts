import { ElectricCollection } from "@smthrs/effect-electric"
import { Collection, LiveQuery, Persistence, Query } from "@smthrs/effect-tanstack-db"
import { BrowserEngine } from "@smthrs/platform-browser"
import { Context, Duration, Effect, Layer, Option, Schema, Stream } from "effect"
import { FLOW_DRAFTS_SHAPE_ROUTE, FLOWS_SHAPE_ROUTE } from "./contract"
import * as Following from "./following"
import { roundExecutionId } from "./round"
import { AnswerRow, Code, CODE, Draft, FlowRow, Form, FORM } from "./schema"
export { AnswerRow, Code, CODE, Form, FORM } from "./schema"

// Your own flows on this tab (decision 0014 §1 "On the device", docs/features/flows.md#the-browser): the person's flows
// and drafts, which Postgres keeps and Electric syncs to every device they sign in on, kept on the device; and this
// tab's own form, unsent answers and code editor kept on the device; the draft it shows, its last refusal and how the
// shown draft's round runs on this device's engine in memory. The round is read again on each batch of the engine's events
// and each change of the drafts, at most once per `FOLLOW_EVERY`; nothing polls.

/** Where the shapes sync from: ChatApi's origin, the site's own. */
export interface FlowsUiConfig {
  readonly origin: string
  /** Stable for one browser tab across reloads; different tabs never share unfinished editors. */
  readonly editorTabId: string
  readonly editorTabPersistent: boolean
  /** How long Save waits for Electric to deliver the flow it saved before the list opens anyway. Default 15 s. */
  readonly confirmWithin?: Duration.Input
}

/** How often the shown draft's round is read again while the engine works or the drafts change. */
export const FOLLOW_EVERY = Duration.millis(200)
/** A failed editor store cannot hold the shared app layer at boot forever. Its rows stay untouched for a later reload. */
export const EDITOR_RESTORE_WITHIN = Duration.seconds(5)

/** A run's status on this device's engine, or `absent` when the engine doesn't hold it (another device, or none). */
export const RoundStatus = Schema.Literals(["pending", "running", "suspended", "completed", "failed", "cancelled", "absent"])
export type RoundStatus = typeof RoundStatus.Type

/** The shown draft's round, `<draftId>:<round>`, as this device's engine last read it. */
export const ROUND = "round"
export const RoundRun = Schema.Struct({ id: Schema.Literal(ROUND), runId: Schema.NullOr(Schema.String), status: RoundStatus })
export type RoundRun = typeof RoundRun.Type

/** The draft this tab shows full size, and the last refusal of an act on it (`name_taken`, `checks`, ...). */
export const SHOWN = "shown"
export const Shown = Schema.Struct({
  id: Schema.Literal(SHOWN),
  draftId: Schema.NullOr(Schema.String),
  refusal: Schema.NullOr(Schema.String),
  busy: Schema.Boolean,
})
export type Shown = typeof Shown.Type

/** The shown draft's round run. */
export const roundQuery = (round: Collection.Collection<RoundRun, string>) =>
  LiveQuery.make((q) => q.from({ round: round.tanstack }).findOne())

/** The draft `shown` names, once the device has it. */
export const draftQuery = (shown: Collection.Collection<Shown, string>, drafts: Collection.Collection<Draft>) =>
  LiveQuery.make((q) =>
    q
      .from({ shown: shown.tanstack })
      .innerJoin({ draft: drafts.tanstack }, ({ shown, draft }) => Query.eq(shown.draftId, draft.id))
      .select(({ shown, draft }) => ({ shown, draft }))
      .findOne()
  )

/** The person's flows, by name. */
export const flowsQuery = (flows: Collection.Collection<FlowRow>) =>
  LiveQuery.make((q) => q.from({ flow: flows.tanstack }).orderBy(({ flow }) => flow.name, "asc"))

/** The person's drafts not saved yet, newest first. */
export const draftsQuery = (drafts: Collection.Collection<Draft>) =>
  LiveQuery.make((q) =>
    q
      .from({ draft: drafts.tanstack })
      .where(({ draft }) => Query.and(Query.not(Query.eq(draft.status, "saved")), Query.not(Query.eq(draft.status, "proposed"))))
      .orderBy(({ draft }) => draft.updatedAt, "desc")
  )

/** The form's row. */
export const formQuery = (form: Collection.Collection<Form, string>, id: string) =>
  LiveQuery.make((q) => q.from({ form: form.tanstack }).where(({ form }) => Query.eq(form.id, id)).findOne())

/** The code this tab shows. */
export const codeQuery = (code: Collection.Collection<Code, string>, id: string) =>
  LiveQuery.make((q) => q.from({ code: code.tanstack }).where(({ code }) => Query.eq(code.id, id)).findOne())

/** Every unsent answer. */
export const answersQuery = (answers: Collection.Collection<AnswerRow, string>, tabId: string) =>
  LiveQuery.make((q) => q.from({ answer: answers.tanstack }).where(({ answer }) => Query.eq(answer.tabId, tabId)))

const answerKey = (row: AnswerRow): string => row.id

type Live<F extends (...args: never) => unknown> = Effect.Success<ReturnType<F>>

/** Your own flows' state for one tab. */
export class FlowsUiStore extends Context.Service<
  FlowsUiStore,
  {
    readonly flows: ElectricCollection.ElectricCollection<FlowRow>
    readonly drafts: ElectricCollection.ElectricCollection<Draft>
    readonly editorTabId: string
    readonly formId: string
    readonly codeId: string
    /** Distinguishes successive openings, including A → B → A in one tab. */
    readonly codeEpoch: { current: number }
    /** Unavailable device storage disables the editors; retained rows are never overwritten. */
    readonly editorAvailable: boolean
    readonly form: Collection.Collection<Form, string>
    readonly answers: Collection.Collection<AnswerRow, string>
    readonly shown: Collection.Collection<Shown, string>
    readonly code: Collection.Collection<Code, string>
    readonly round: Collection.Collection<RoundRun, string>
    readonly draft: Live<typeof draftQuery>
    readonly flowList: Live<typeof flowsQuery>
    readonly draftList: Live<typeof draftsQuery>
    readonly formRow: Live<typeof formQuery>
    readonly answerList: Live<typeof answersQuery>
    readonly codeRow: Live<typeof codeQuery>
    readonly roundRow: Live<typeof roundQuery>
    readonly confirmWithin: Duration.Input
    /** Reads the shown draft's round from this device's engine again. */
    readonly readRound: Effect.Effect<void>
    /**
     * What Draft again does after the draft's round `round`: start the first later round this device's engine holds
     * no run of, skipping rounds whose runs here failed or stopped; nothing when a later round started here is still
     * going or done but not delivered yet (`Pending`); or say the engine can't be read (`Unreadable`).
     */
    readonly nextRound: (draftId: string, round: number) => Effect.Effect<Following.NextRound>
  }
>()("@smthrs/mvp/flows/FlowsUiStore") {
  /**
   * The store over this tab's `BrowserEngine`; its collections cleaned up, its Electric shapes closed and its following
   * of the engine stopped when the scope closes.
   */
  static readonly layer = (config: FlowsUiConfig) =>
    Layer.effect(
      FlowsUiStore,
      Effect.gen(function* () {
        const engine = yield* BrowserEngine.BrowserEngine
        const storageAvailable = Option.isSome((yield* Persistence.Persistence).persistence)
        if (!storageAvailable) yield* Effect.logWarning("flows.editor.storage").pipe(
          Effect.annotateLogs({ collection: "device", outcome: "unavailable" }),
        )
        const editorTabId = config.editorTabId
        const formId = `${FORM}:${editorTabId}`
        const codeId = `${CODE}:${editorTabId}`
        const shape = (route: string) => ({
          url: `${config.origin}${route}`,
          columnMapper: ElectricCollection.snakeCamelMapper(),
          parser: {
            int4: (value: string) => Number(value),
            timestamptz: (value: string) => new Date(value).toISOString(),
          },
        })
        const flows = yield* ElectricCollection.make<FlowRow>({
          id: "flows",
          schema: FlowRow,
          getKey: (row) => row.id,
          syncMode: "eager",
          // 2: rows carry where the flow runs (`placement`).
          persist: { schemaVersion: 2 },
          shape: shape(FLOWS_SHAPE_ROUTE),
        })
        const drafts = yield* ElectricCollection.make<Draft>({
          id: "flow-drafts",
          schema: Draft,
          getKey: (row) => row.id,
          syncMode: "eager",
          persist: { schemaVersion: 1 },
          shape: shape(FLOW_DRAFTS_SHAPE_ROUTE),
        })
        const formSeed = (): Form => ({ id: formId, name: "", request: "", draftId: crypto.randomUUID(), seeded: false })
        const savedForm = yield* Collection.persisted<Form, string>({
          id: "flow-form",
          schema: Form,
          getKey: (row) => row.id,
          schemaVersion: 1,
        })
        const savedAnswers = yield* Collection.persisted<AnswerRow, string>({
          id: "flow-answers",
          schema: AnswerRow,
          getKey: answerKey,
          schemaVersion: 1,
        })
        const codeSeed = (): Code => ({
          id: codeId, name: "", state: "loading", revision: 0, source: "", text: "", busy: false, refusal: null,
        })
        const savedCode = yield* Collection.persisted<Code, string>({
          id: "flow-code",
          schema: Code,
          getKey: (row) => row.id,
          schemaVersion: 1,
        })
        // Restore independently so one unavailable store adds at most one deadline to app boot.
        const [formReady, answersReady, codeReady] = yield* Effect.all([
          Effect.result(Effect.gen(function* () {
            yield* savedForm.restored
            if (Option.isNone(yield* savedForm.get(formId))) {
              yield* Effect.flatMap(savedForm.insert(formSeed()), (write) => write.persisted)
            }
          }).pipe(Effect.timeout(EDITOR_RESTORE_WITHIN))),
          Effect.result(savedAnswers.restored.pipe(Effect.timeout(EDITOR_RESTORE_WITHIN))),
          Effect.result(Effect.gen(function* () {
            yield* savedCode.restored
            if (Option.isNone(yield* savedCode.get(codeId))) {
              yield* Effect.flatMap(savedCode.insert(codeSeed()), (write) => write.persisted)
            }
          }).pipe(Effect.timeout(EDITOR_RESTORE_WITHIN))),
        ] as const, { concurrency: 3 })
        if (formReady._tag === "Failure") yield* Effect.logWarning("flows.editor.storage").pipe(Effect.annotateLogs({ collection: "flow-form", outcome: "failed" }))
        const form = formReady._tag === "Success" ? savedForm : yield* Collection.local<Form, string>({
          id: "flow-form-unavailable", schema: Form, getKey: (row) => row.id, initialData: [formSeed()],
        })
        const answers = answersReady._tag === "Success" ? savedAnswers : yield* Effect.andThen(
          Effect.logWarning("flows.editor.storage").pipe(
            Effect.annotateLogs({ collection: "flow-answers", outcome: "failed" }),
          ),
          Collection.local<AnswerRow, string>({
            // Read-only and empty while the editors are disabled; reuse the saved store's identity rule.
            id: "flow-answers-unavailable", schema: AnswerRow, getKey: answerKey, initialData: [],
          }),
        )
        const shown = yield* Collection.local<Shown, string>({
          id: "flow-shown",
          schema: Shown,
          getKey: (row) => row.id,
          initialData: [{ id: SHOWN, draftId: null, refusal: null, busy: false }],
        })
        if (codeReady._tag === "Failure") yield* Effect.logWarning("flows.editor.storage").pipe(Effect.annotateLogs({ collection: "flow-code", outcome: "failed" }))
        const code = codeReady._tag === "Success" ? savedCode : yield* Collection.local<Code, string>({
          id: "flow-code-unavailable", schema: Code, getKey: (row) => row.id, initialData: [codeSeed()],
        })
        const editorAvailable = config.editorTabPersistent && storageAvailable && formReady._tag === "Success" && answersReady._tag === "Success" && codeReady._tag === "Success"
        const round = yield* Collection.local<RoundRun, string>({
          id: "flow-round",
          schema: RoundRun,
          getKey: (row) => row.id,
          initialData: [{ id: ROUND, runId: null, status: "absent" }],
        })

        /** How this engine holds `runId`: its status, `absent` when it doesn't hold it, or none when it can't be read. */
        const statusOf = (runId: string) =>
          engine.inspect(runId, { limit: 1 }).pipe(
            Effect.map((inspection): Option.Option<RoundStatus> => Option.some(inspection.run.status)),
            Effect.catch((failure) => Effect.succeed(Following.refusedRead(failure))),
          )

        const readRound = Following.readRound({
          shownRunId: Effect.gen(function* () {
            const showing = Option.getOrThrow(yield* shown.get(SHOWN))
            const draft = showing.draftId === null ? Option.none() : yield* drafts.get(showing.draftId)
            return Option.match(draft, { onNone: () => null, onSome: (row) => roundExecutionId(row.id, row.round) })
          }),
          statusOf,
          write: (runId, status) =>
            Effect.asVoid(round.update(ROUND, (row) => {
              row.runId = runId
              row.status = status
            })).pipe(Effect.orDie),
        })

        const nextRound = (draftId: string, after: number) => Following.nextRound(statusOf, draftId, after)

        // Every batch of the engine's events for the shown draft, and every change of the drafts, reads the round again.
        yield* Stream.merge(
          engine.events.pipe(Stream.map((event) => event.executionId)),
          drafts.changes().pipe(Stream.as("")),
        ).pipe(
          Stream.groupedWithin(Number.MAX_SAFE_INTEGER, FOLLOW_EVERY),
          Stream.runForEach((ids) =>
            Effect.gen(function* () {
              const { draftId } = Option.getOrThrow(yield* shown.get(SHOWN))
              if (draftId === null) return
              if (ids.some((id) => id === "" || id.startsWith(`${draftId}:`))) yield* readRound
            })
          ),
          Effect.forkScoped,
        )

        return FlowsUiStore.of({
          flows,
          drafts,
          editorTabId,
          formId,
          codeId,
          codeEpoch: { current: 0 },
          editorAvailable,
          form,
          answers,
          shown,
          code,
          round,
          readRound,
          nextRound,
          draft: yield* draftQuery(shown, drafts),
          flowList: yield* flowsQuery(flows),
          draftList: yield* draftsQuery(drafts),
          formRow: yield* formQuery(form, formId),
          answerList: yield* answersQuery(answers, editorTabId),
          codeRow: yield* codeQuery(code, codeId),
          roundRow: yield* roundQuery(round),
          confirmWithin: config.confirmWithin ?? Duration.seconds(15),
        })
      }),
    )
}
