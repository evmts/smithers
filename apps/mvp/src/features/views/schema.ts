import { WebPage } from "@smthrs/views"
import { Schema } from "effect"
import { MAX_PATH, MAX_VIEW_TEXT_BYTES } from "../docs/contract"
import { MAX_URL_LENGTH } from "../web/contract"
import { VIEW_TEMPLATES } from "./contract"

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

/**
 * One row of Postgres `views` as Electric delivers it: columns in camelCase, `position` (int8) parsed to a number, and
 * `props` (jsonb) as an object. `position` comes from the conversation's own sequence, so a view sits among the messages
 * in the order it was added.
 */
export const View = Schema.Struct({
  id: Schema.String,
  template: Template,
  props: ViewProps,
  position: Schema.Number,
  createdAt: Schema.String,
})
export type View = typeof View.Type

/** `POST /api/views`: a view to add, by an id its writer chose, so a step run again adds it once. */
export const ViewWrite = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  template: Template,
  /**
   * The page's URL and what its check read; for a `docs` view also its repository and path, which ChatApi looks up
   * in that repository's docs index. A write never carries Markdown: ChatApi drops any.
   */
  props: Schema.Struct({ ...PageProps.fields, repository: Schema.optional(Repository), path: Schema.optional(DocsPath) }),
  /** The conversation the view belongs to (decision 0013 §1); the home conversation when absent. */
  conversationId: Schema.optional(Schema.String.check(Schema.isUUID())),
  /**
   * The answer whose run adds it, for an agent's call: the view goes to that answer's conversation, whatever the
   * person's tab shows now, and only the person who asked may add it. It wins over `conversationId`.
   */
  answerId: Schema.optional(Schema.String.check(Schema.isUUID())),
})
export type ViewWrite = typeof ViewWrite.Type

/** What `POST /api/views` answers: the transaction it added the view in, or `null` when it had it already. */
export const ViewAdded = Schema.Struct({ txid: Schema.NullOr(Schema.Number) })

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
