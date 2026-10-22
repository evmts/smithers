import { ElectricCollection } from "@smthrs/effect-electric"
import { Collection, LiveQuery, Query } from "@smthrs/effect-tanstack-db"
import { BrowserEngine } from "@smthrs/platform-browser"
import { Context, Duration, Effect, Layer, Option, Schema, Stream } from "effect"
import { FLOW_DRAFTS_SHAPE_ROUTE, FLOWS_SHAPE_ROUTE } from "./contract"
import * as Following from "./following"
import { roundExecutionId } from "./round"
import { Draft, FlowRow } from "./schema"

// Your own flows on this tab (decision 0014 §1 "On the device", docs/features/flows.md#the-browser): the person's flows
// and drafts, which Postgres keeps and Electric syncs to every device they sign in on, kept on the device; and this
// tab's own form, unsent answers, the draft it shows and a draft's last refusal, the code it shows, and how the shown
// draft's round runs on this device's engine, in memory. The round is read again on each batch of the engine's events
// and each change of the drafts, at most once per `FOLLOW_EVERY`; nothing polls.

/** Where the shapes sync from: ChatApi's origin, the site's own. */
export interface FlowsUiConfig {
  readonly origin: string
  /** How long Save waits for Electric to deliver the flow it saved before the list opens anyway. Default 15 s. */
  readonly confirmWithin?: Duration.Input
}

/**
 * The new-flow form: its one row, with the draft id its Draft starts. A second press before the first is admitted
 * starts the same execution, which the engine runs once.
 */
export const FORM = "form"
export const Form = Schema.Struct({
  id: Schema.Literal(FORM),
  name: Schema.String,
  request: Schema.String,
  draftId: Schema.String,
})
export type Form = typeof Form.Type

/** How often the shown draft's round is read again while the engine works or the drafts change. */
export const FOLLOW_EVERY = Duration.millis(200)

/** A run's status on this device's engine, or `absent` when the engine doesn't hold it (another device, or none). */
export const RoundStatus = Schema.Literals(["pending", "running", "suspended", "completed", "failed", "cancelled", "absent"])
export type RoundStatus = typeof RoundStatus.Type

/** The shown draft's round, `<draftId>:<round>`, as this device's engine last read it. */
export const ROUND = "round"
export const RoundRun = Schema.Struct({ id: Schema.Literal(ROUND), runId: Schema.NullOr(Schema.String), status: RoundStatus })
export type RoundRun = typeof RoundRun.Type

/** One unsent answer, `<draftId>:<questionId>`. */
export const AnswerRow = Schema.Struct({
  id: Schema.String,
  draftId: Schema.String,
  questionId: Schema.String,
  value: Schema.String,
})
export type AnswerRow = typeof AnswerRow.Type

/** The draft this tab shows full size, and the last refusal of an act on it (`name_taken`, `checks`, ...). */
export const SHOWN = "shown"
export const Shown = Schema.Struct({
  id: Schema.Literal(SHOWN),
  draftId: Schema.NullOr(Schema.String),
  refusal: Schema.NullOr(Schema.String),
  busy: Schema.Boolean,
})
export type Shown = typeof Shown.Type

/**
 * The flow whose code this tab shows: its name, how reading it went, the revision and source it read, the text as the
 * person edited it, and a write in flight or its last refusal (`stale`, `check:<check>`, ...).
 */
export const CODE = "code"
export const Code = Schema.Struct({
  id: Schema.Literal(CODE),
  name: Schema.String,
  state: Schema.Literals(["loading", "read", "not_found", "unavailable"]),
  revision: Schema.Number,
  source: Schema.String,
  text: Schema.String,
  busy: Schema.Boolean,
  refusal: Schema.NullOr(Schema.String),
})
export type Code = typeof Code.Type

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
export const formQuery = (form: Collection.Collection<Form, string>) =>
  LiveQuery.make((q) => q.from({ form: form.tanstack }).findOne())

/** The code this tab shows. */
export const codeQuery = (code: Collection.Collection<Code, string>) =>
  LiveQuery.make((q) => q.from({ code: code.tanstack }).findOne())

/** Every unsent answer. */
export const answersQuery = (answers: Collection.Collection<AnswerRow, string>) =>
  LiveQuery.make((q) => q.from({ answer: answers.tanstack }))

type Live<F extends (...args: never) => unknown> = Effect.Success<ReturnType<F>>

/** Your own flows' state for one tab. */
export class FlowsUiStore extends Context.Service<
  FlowsUiStore,
  {
    readonly flows: ElectricCollection.ElectricCollection<FlowRow>
    readonly drafts: ElectricCollection.ElectricCollection<Draft>
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
        const form = yield* Collection.local<Form, string>({
          id: "flow-form",
          schema: Form,
          getKey: (row) => row.id,
          initialData: [{ id: FORM, name: "", request: "", draftId: crypto.randomUUID() }],
        })
        const answers = yield* Collection.local<AnswerRow, string>({
          id: "flow-answers",
          schema: AnswerRow,
          getKey: (row) => row.id,
        })
        const shown = yield* Collection.local<Shown, string>({
          id: "flow-shown",
          schema: Shown,
          getKey: (row) => row.id,
          initialData: [{ id: SHOWN, draftId: null, refusal: null, busy: false }],
        })
        const code = yield* Collection.local<Code, string>({
          id: "flow-code",
          schema: Code,
          getKey: (row) => row.id,
          initialData: [
            { id: CODE, name: "", state: "loading", revision: 0, source: "", text: "", busy: false, refusal: null },
          ],
        })
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
          formRow: yield* formQuery(form),
          answerList: yield* answersQuery(answers),
          codeRow: yield* codeQuery(code),
          roundRow: yield* roundQuery(round),
          confirmWithin: config.confirmWithin ?? Duration.seconds(15),
        })
      }),
    )
}
