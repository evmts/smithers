import { Interactions, WebPage } from "@smthrs/views"
import { Schema } from "effect"
import { MAX_PATH, MAX_VIEW_TEXT_BYTES } from "../docs/contract"
import { MAX_URL_LENGTH } from "../web/contract"
import {
  MAX_SUBMIT_LABEL,
  MAX_VIEW_JSON_BYTES,
  MAX_VIEW_TITLE,
  PAGE_TEMPLATES,
  VIEW_SIZES,
  VIEW_TEMPLATES,
} from "./contract"

// The conversation's views (decision 0004 §8): rows of Postgres `views`, synced to every device and every person in the
// conversation like its messages. A view stored on the device is read by the next version of the app too: change its
// shape only with its collection's `schemaVersion`.

/** A view's template. */
export const Template = Schema.Literals(VIEW_TEMPLATES)

/** An `https:` URL with no user or password: the only icon a card loads. */
const isHttpsUrl = (value: string) => {
  const url = URL.parse(value)
  return url !== null && url.protocol === "https:" && url.username === "" && url.password === ""
}

/**
 * What both templates render: the outside page's URL, which the policy allowed (src/features/web/url.ts), and what
 * ChatApi's check read from the page's head (`@smthrs/views`' `WebPage.Preview`): its title, description and `https:`
 * icon, which a card shows, and a framed page shows until it loads. A row from before the check has the URL alone.
 */
export const PageProps = Schema.Struct({
  url: Schema.String.check(Schema.isMaxLength(MAX_URL_LENGTH)),
  title: Schema.optional(Schema.String.check(Schema.isMaxLength(WebPage.MAX_TITLE))),
  description: Schema.optional(Schema.String.check(Schema.isMaxLength(WebPage.MAX_DESCRIPTION))),
  icon: Schema.optional(
    Schema.String.check(Schema.isMaxLength(WebPage.MAX_ICON_URL), Schema.makeFilter(isHttpsUrl)),
  ),
})

/** A repository as a `docs` view names it: `owner/name`. */
const Repository = Schema.String.check(Schema.isMaxLength(140), Schema.isPattern(/^[^/\s]+\/[^/\s]+$/))

/** A page's path on its docs site, as its index lists it. */
const DocsPath = Schema.String.check(Schema.isMaxLength(MAX_PATH), Schema.isPattern(/^\//))

/**
 * What a view renders. Every template has the page's URL and title (`PageProps`); a `docs` view also names the
 * repository whose docs index lists the page, the page's path in it, and the Markdown ChatApi read for it (at most 64
 * KiB, `truncated` when cut), so every device shows it offline. A client never chooses the Markdown: ChatApi reads it
 * from the repository's own index (worker/Views.ts).
 */
export const ViewProps = Schema.Struct({
  ...PageProps.fields,
  repository: Schema.optional(Repository),
  path: Schema.optional(DocsPath),
  // Characters bound the schema; ChatApi keeps at most MAX_VIEW_TEXT_BYTES of UTF-8, which is never more characters.
  text: Schema.optional(Schema.String.check(Schema.isMaxLength(MAX_VIEW_TEXT_BYTES))),
  truncated: Schema.optional(Schema.Boolean),
})
export type ViewProps = typeof ViewProps.Type

/** Whether `value` is a JSON object of at most {@link MAX_VIEW_JSON_BYTES} bytes. */
const isBoundedObject = (value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  new TextEncoder().encode(JSON.stringify(value)).length <= MAX_VIEW_JSON_BYTES

/** A JSON object of at most {@link MAX_VIEW_JSON_BYTES} bytes. */
export const BoundedObject = Schema.Record(Schema.String, Schema.Unknown).check(Schema.makeFilter(isBoundedObject))

/** A view's title: what a form asks, or a generated view's accessible name. */
export const ViewTitle = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_VIEW_TITLE))

/** Where a view shows first. */
export const Size = Schema.Literals(VIEW_SIZES)
export type Size = typeof Size.Type

/**
 * A form's props (decision 0004 §3): what it asks, the JSON Schema its fields come from (`@smthrs/ui`'s
 * `formFieldsFor`), and the submit button's label, which is the submission's question text.
 */
export const FormProps = Schema.Struct({
  title: ViewTitle,
  schema: BoundedObject,
  submitLabel: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_SUBMIT_LABEL)),
})
export type FormProps = typeof FormProps.Type

/** One submitted value. */
export const FormValue = Schema.Union([Schema.String, Schema.Number, Schema.Boolean])

/** A form's values, by field name. */
export const FormValues = Schema.Record(Schema.String, FormValue).check(Schema.makeFilter(isBoundedObject))
export type FormValues = typeof FormValues.Type

/** A form's state: open, or submitted with its values by the question `questionId`, written with that question. */
export const FormState = Schema.Struct({
  submitted: Schema.Boolean,
  values: Schema.optional(FormValues),
  questionId: Schema.optional(Schema.String),
})
export type FormState = typeof FormState.Type

/** An outside page's row: a framed `webpage` or a `link` card, with its page's props. */
export const PageView = Schema.Struct({ template: Schema.Literals(PAGE_TEMPLATES), props: ViewProps })

/** The agent's form's row: its props and state. */
export const FormView = Schema.Struct({ template: Schema.Literal("form"), props: FormProps, state: FormState })

/**
 * A generated view's row, as ChatApi's presentation realm rendered it: its title, first size, `props` (the data the
 * agent gave it), `state`, the `html` it rendered from them, its declared `interactions`, and its `revision`, which each
 * state change bumps. The module itself stays on the server.
 */
export const GeneratedView = Schema.Struct({
  template: Schema.Literal("generated"),
  title: ViewTitle,
  size: Size,
  props: BoundedObject,
  state: Schema.Unknown,
  html: Schema.String,
  interactions: Interactions.Declared,
  revision: Schema.Number,
})

/** Whether a row holds what its template needs: one of the three rows above. */
const isTemplateRow = Schema.is(Schema.Union([PageView, FormView, GeneratedView]))

/**
 * One row of Postgres `views` as Electric delivers it: columns in camelCase, `position` (int8) parsed to a number, and
 * the jsonb columns as values. `position` comes from the conversation's own sequence, so a view sits among the messages
 * in the order it was added. One flat row, so the conversation's live queries read every template alike; what it must
 * hold depends on its template (`PageView`, `FormView`, `GeneratedView`), which decoding checks, so a row the device
 * keeps is one its template renders. Electric sends every column, `null` where a template has none.
 */
export const View = Schema.Struct({
  id: Schema.String,
  template: Template,
  props: Schema.Record(Schema.String, Schema.Unknown),
  position: Schema.Number,
  createdAt: Schema.String,
  title: Schema.NullOr(Schema.String),
  size: Size,
  state: Schema.Unknown,
  html: Schema.NullOr(Schema.String),
  interactions: Schema.NullOr(Interactions.Declared),
  revision: Schema.Number,
}).check(Schema.makeFilter(isTemplateRow))
export type View = typeof View.Type

/** Where a view goes, as `POST /api/views` reads it. */
const placeFields = {
  id: Schema.String.check(Schema.isUUID()),
  /** The conversation the view belongs to (decision 0013 §1); the home conversation when absent. */
  conversationId: Schema.optional(Schema.String.check(Schema.isUUID())),
  /**
   * The answer whose run adds it, for an agent's call: the view goes to that answer's conversation, whatever the
   * person's tab shows now, and only the person who asked may add it. It wins over `conversationId`.
   */
  answerId: Schema.optional(Schema.String.check(Schema.isUUID())),
}

/** `POST /api/views` for an outside page: a view to add, by an id its writer chose, so a step run again adds it once. */
export const PageWrite = Schema.Struct({ ...placeFields, template: Schema.Literals(PAGE_TEMPLATES), props: Schema.Struct({ ...PageProps.fields, repository: Schema.optional(Repository), path: Schema.optional(DocsPath) }) })
export type PageWrite = typeof PageWrite.Type

/** `POST /api/views` for a form: its props; it starts open. */
export const FormWrite = Schema.Struct({ ...placeFields, template: Schema.Literal("form"), props: FormProps })
export type FormWrite = typeof FormWrite.Type

/**
 * `POST /api/views` for a generated view: the renderer's module, its title and first size, the data it renders
 * (`props`) and its first `state`. ChatApi checks and renders the module itself, and keeps what it rendered.
 */
export const GeneratedWrite = Schema.Struct({
  ...placeFields,
  template: Schema.Literal("generated"),
  title: ViewTitle,
  size: Size,
  code: Schema.String,
  props: BoundedObject,
  state: Schema.Unknown,
})
export type GeneratedWrite = typeof GeneratedWrite.Type

/** `POST /api/views`: a view to add, by an id its writer chose, so a step run again adds it once. */
export const ViewWrite = Schema.Union([PageWrite, FormWrite, GeneratedWrite])
export type ViewWrite = typeof ViewWrite.Type

/**
 * What `POST /api/views/<id>/state` takes: the move's own id, stable across its retries, the revision the device saw,
 * and one declared `state` event.
 */
export const StateWrite = Schema.Struct({
  moveId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  event: Interactions.Event,
})
export type StateWrite = typeof StateWrite.Type

/** What `POST /api/views/<id>/state` answers: the transaction and the revision the move made; `null` for a move made before. */
export const StateChanged = Schema.Struct({ txid: Schema.NullOr(Schema.Number), revision: Schema.Number })

/**
 * A generated view ChatApi couldn't keep: the module failed `ViewCode.check` or its render (`422`), with what went
 * wrong for the renderer to correct. It may quote the module, so only the step that wrote it reads it; it is never
 * logged.
 */
export const NotRenderedBody = Schema.Struct({ code: Schema.Literal("not_rendered"), detail: Schema.String })

/**
 * What `POST /api/views` answers: the transaction it added the view in, or `null` when it had it already, and a
 * generated view's declared events.
 */
export const ViewAdded = Schema.Struct({
  txid: Schema.NullOr(Schema.Number),
  /** A generated view's declared events, as ChatApi's check read them from its module. */
  interactions: Schema.optional(Interactions.Declared),
})
export type ViewAdded = typeof ViewAdded.Type

/** A refusal's body: its code. */
export const ViewRefusal = Schema.Struct({ code: Schema.String })

/** The one view a full-screen route shows, in this tab: its id, or none. One row. */
export const SHOWING = "showing"
export const Showing = Schema.Struct({
  id: Schema.Literal(SHOWING),
  viewId: Schema.NullOr(Schema.String),
  /** The branch conversation the view belongs to; `null` for the home conversation's. */
  conversationId: Schema.optional(Schema.NullOr(Schema.String)),
})
export type Showing = typeof Showing.Type
