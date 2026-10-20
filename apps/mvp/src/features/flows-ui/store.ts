import { ElectricCollection } from "@smthrs/effect-electric"
import { Collection, LiveQuery, Query } from "@smthrs/effect-tanstack-db"
import { Context, Duration, Effect, Layer, Schema } from "effect"
import { FLOW_DRAFTS_SHAPE_ROUTE, FLOWS_SHAPE_ROUTE } from "./contract"
import { Draft, FlowRow } from "./schema"

// Your own flows on this tab (decision 0014 §1 "On the device", docs/features/flows.md#the-browser): the person's flows
// and drafts, which Postgres keeps and Electric syncs to every device they sign in on, kept on the device; and this
// tab's own form, unsent answers, the draft it shows and a draft's last refusal, in memory.

/** Where the shapes sync from: ChatApi's origin, the site's own. */
export interface FlowsUiConfig {
  readonly origin: string
  /** How long Save waits for Electric to deliver the flow it saved before the list opens anyway. Default 15 s. */
  readonly confirmWithin?: Duration.Input
}

/** The new-flow form: its one row. */
export const FORM = "form"
export const Form = Schema.Struct({ id: Schema.Literal(FORM), name: Schema.String, request: Schema.String })
export type Form = typeof Form.Type

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
    readonly draft: Live<typeof draftQuery>
    readonly flowList: Live<typeof flowsQuery>
    readonly draftList: Live<typeof draftsQuery>
    readonly formRow: Live<typeof formQuery>
    readonly answerList: Live<typeof answersQuery>
    readonly confirmWithin: Duration.Input
  }
>()("@smthrs/mvp/flows/FlowsUiStore") {
  /** The store; its collections cleaned up and its Electric shapes closed when the scope closes. */
  static readonly layer = (config: FlowsUiConfig) =>
    Layer.effect(
      FlowsUiStore,
      Effect.gen(function* () {
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
          persist: { schemaVersion: 1 },
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
          initialData: [{ id: FORM, name: "", request: "" }],
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
        return FlowsUiStore.of({
          flows,
          drafts,
          form,
          answers,
          shown,
          draft: yield* draftQuery(shown, drafts),
          flowList: yield* flowsQuery(flows),
          draftList: yield* draftsQuery(drafts),
          formRow: yield* formQuery(form),
          answerList: yield* answersQuery(answers),
          confirmWithin: config.confirmWithin ?? Duration.seconds(15),
        })
      }),
    )
}
