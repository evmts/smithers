/**
 * The messages a tab and the engine's leader exchange over the app
 * database's `BroadcastChannel`, `<name>/sql`: a channel of its own, so the
 * engine's tabs never decode rows meant for another tab.
 *
 * - A tab posts `Execute` under its own client id and a request number, one
 *   request at a time; only the leader answers, with `Executed` or `Failed`
 *   addressed to that client and number.
 * - `transaction` names the leader that holds the tab's open transaction, and
 *   `opened` the request that opened it. A statement for a transaction
 *   another leader held is never run outside it: the new leader answers it as
 *   committed when the old one committed the transaction with it, and refuses
 *   it otherwise, so the tab runs the transaction again.
 * - A worker that starts serving posts `Ready`, and every tab posts its
 *   unanswered request again. A leader runs each request once; a new leader
 *   runs a request the old one may have run before it stopped.
 *
 * Rows, parameters and SQLite's own messages travel in the replies; none is
 * ever logged.
 *
 * @since 1.0.0
 */

import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const addressed = {
  client: Schema.String,
  id: Schema.Number
}

/**
 * Run `sql` with `params` for `client`. `opened` is set with `transaction`.
 *
 * @category protocol
 * @since 1.0.0
 */
export const Execute = Schema.TaggedStruct("Execute", {
  ...addressed,
  sql: Schema.String,
  params: Schema.Array(Schema.Unknown),
  transaction: Schema.NullOr(Schema.String),
  opened: Schema.optional(Schema.Number)
})

/**
 * The leader ran the statement. `leader` names the leader; `open` says
 * whether the statement left the client's transaction open.
 *
 * @category protocol
 * @since 1.0.0
 */
export const Executed = Schema.TaggedStruct("Executed", {
  ...addressed,
  leader: Schema.String,
  rows: Schema.Array(Schema.Unknown),
  open: Schema.Boolean
})

/**
 * The leader refused the statement. `error` is the failure's tag; `code` and
 * `message` are SQLite's, when SQLite refused it.
 *
 * @category protocol
 * @since 1.0.0
 */
export const Failed = Schema.TaggedStruct("Failed", {
  ...addressed,
  error: Schema.String,
  code: Schema.optional(Schema.Number),
  message: Schema.optional(Schema.String)
})

/**
 * A worker serves statements from now on.
 *
 * @category protocol
 * @since 1.0.0
 */
export const Ready = Schema.TaggedStruct("Ready", {})

/**
 * Every message on the channel.
 *
 * @category protocol
 * @since 1.0.0
 */
export const Message = Schema.Union([Execute, Executed, Failed, Ready])

/**
 * The value form of {@link Message}.
 *
 * @category protocol
 * @since 1.0.0
 */
export type Message = typeof Message.Type

const decodeMessage = Schema.decodeUnknownOption(Message)

/**
 * Decodes a channel message, or `undefined` for anything else posted there.
 *
 * @category protocol
 * @since 1.0.0
 */
export const decode = (input: unknown): Message | undefined => Option.getOrUndefined(decodeMessage(input))

/**
 * Encodes a message for `postMessage`.
 *
 * @category protocol
 * @since 1.0.0
 */
export const encode: (message: Message) => unknown = Schema.encodeSync(Message)

/**
 * The app database's channel for the engine `name`.
 *
 * @category protocol
 * @since 1.0.0
 */
export const channel = (name: string): string => `${name}/sql`

/**
 * The Web Lock a tab holds while it lives, so the leader rolls back a
 * transaction the tab leaves open when it ends.
 *
 * @category protocol
 * @since 1.0.0
 */
export const clientLock = (name: string, client: string): string => `${name}/sql/${client}`

/**
 * The leader's table in the app's database: each tab's last transaction, as
 * the request that opened it, written inside that transaction. It commits with
 * the transaction and goes with a rollback, so a new leader can tell whether a
 * statement the old one never answered committed it.
 *
 * @category protocol
 * @since 1.0.0
 */
export const commits = "shared_sqlite_commits"
