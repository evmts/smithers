import { type Collection, LiveQuery, Query } from "@smthrs/effect-tanstack-db"
import type { Effect } from "effect"
import { COULDNT_ANSWER } from "./contract"
import type { Asking, Composer, Connection, History, Message, Unsent } from "./schema"

// What every frontend reads. Each is a live query over this device's collections, built once per ChatStore; it starts
// on first read. React renders its `tanstack` collection with `useLiveQuery`; a TUI reads its `rows` stream. No query
// waits for the network: they read only what the device has.

/**
 * The whole conversation on this device: `messages ∪ (unsent − messages) ∪ (asking − messages − unsent)`.
 * - Synced rows come first, in Postgres' order (`position`); a failed answer reads the failure copy.
 * - Then this device's own rows, in the order they were asked (`queuedAt`): questions the server refused or the outbox
 *   couldn't take (`unsent`; `sendAgain` when the outbox couldn't, so Retry applies rather than Edit), unless Postgres
 *   has that very question with the answer this device made for it, and questions the outbox holds that Postgres
 *   doesn't have yet (`queued`).
 *   A queued question never overlays a synced row: once Postgres has it, only the synced row shows.
 */
export const conversationQuery = (
  messages: Collection.Collection<Message>,
  unsent: Collection.Collection<Unsent, string>,
  asking: Collection.Collection<Asking, string>,
) =>
  LiveQuery.make((q) =>
    q
      .unionAll(
        q.from({ synced: messages.tanstack }).select(({ synced }) => ({
          id: synced.id,
          role: synced.role,
          text: Query.caseWhen(Query.eq(synced.status, "failed"), COULDNT_ANSWER, synced.text),
          status: synced.status,
          sendAgain: false,
          local: 0,
          at: synced.position,
        })),
        q
          .from({ refused: unsent.tanstack })
          // Postgres' answer to a question with this id. When it is the answer this device made for it, Postgres has
          // this very question, and its synced row shows instead: an unsent copy the device couldn't drop never shows
          // twice. A question whose id another message took has another answer, and stays.
          .leftJoin({ answer: messages.tanstack }, ({ refused, answer }) => Query.eq(refused.id, answer.questionId))
          .where(({ refused, answer }) =>
            Query.or(Query.isUndefined(answer?.id), Query.not(Query.eq(answer?.id, refused.answerId))),
          )
          .select(({ refused }) => ({
            id: refused.id,
            role: "user" as const,
            text: refused.text,
            status: "unsent",
            sendAgain: Query.eq(refused.reason, "not_admitted"),
            local: 1,
            at: refused.queuedAt,
          })),
        q
          .from({ queued: asking.tanstack })
          .leftJoin({ inPostgres: messages.tanstack }, ({ queued, inPostgres }) => Query.eq(queued.id, inPostgres.id))
          .leftJoin({ inUnsent: unsent.tanstack }, ({ queued, inUnsent }) => Query.eq(queued.id, inUnsent.id))
          .where(({ inPostgres, inUnsent }) =>
            Query.and(Query.isUndefined(inPostgres?.id), Query.isUndefined(inUnsent?.id)),
          )
          .select(({ queued }) => ({
            id: queued.id,
            role: "user" as const,
            text: queued.text,
            status: "queued",
            sendAgain: false,
            local: 1,
            at: queued.queuedAt,
          })),
      )
      .orderBy(({ $selected }) => $selected.local)
      .orderBy(({ $selected }) => $selected.at),
  )

/** The conversation's live query. */
export type Conversation = Effect.Success<ReturnType<typeof conversationQuery>>

/** The most recent `limit` messages of the conversation, newest first: the window "Load earlier" widens. */
export const latestQuery = (conversation: Conversation, limit: number) =>
  LiveQuery.make((q) =>
    q
      .from({ message: conversation.tanstack })
      .orderBy(({ message }) => message.local, "desc")
      .orderBy(({ message }) => message.at, "desc")
      .limit(limit),
  )

/** The window's live query. */
export type Latest = Effect.Success<ReturnType<typeof latestQuery>>

/** The window, oldest first: what the conversation view shows. */
export const shownQuery = (latest: Latest) =>
  LiveQuery.make((q) =>
    q
      .from({ message: latest.tanstack })
      .orderBy(({ message }) => message.local)
      .orderBy(({ message }) => message.at),
  )

/** The questions queued on this device that Postgres doesn't have yet: the pill counts them. */
export const queuedQuery = (conversation: Conversation) =>
  LiveQuery.make((q) =>
    q.from({ message: conversation.tanstack }).where(({ message }) => Query.eq(message.status, "queued")),
  )

/** This tab's composer. */
export const composerQuery = (composer: Collection.Collection<Composer, string>) =>
  LiveQuery.make((q) => q.from({ composer: composer.tanstack }).findOne())

/** This tab's connection, as the pill shows it. */
export const connectionQuery = (connection: Collection.Collection<Connection, string>) =>
  LiveQuery.make((q) => q.from({ connection: connection.tanstack }).findOne())

/** This tab's view of the conversation: whether it has opened, and whether "Load earlier" applies. */
export const historyQuery = (history: Collection.Collection<History, string>) =>
  LiveQuery.make((q) => q.from({ history: history.tanstack }).findOne())
