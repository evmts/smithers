import type { Effect } from "effect"
import * as Collections from "../../lib/collections"
import {
  type Ask,
  CHAT_FAILED,
  type Composer,
  type FailedMessage,
  type History,
  type Message,
  PENDING_POSITION,
  type SyncHealth,
} from "./schema"

// What every frontend reads. Each is a live query: React renders it with `useLiveQuery`, a TUI with
// `Collections.changes`. They're built once per ChatStore and start on first read.
//
// `messages` syncs on demand, so its queries decide what Electric sends of the past: `recent`'s `orderBy` and `limit`.
// Rows this tab inserted stay out of that window until Postgres gives them a position (`pending`), so asking, or a
// question rolling back, never makes the window reload its rows from Electric.

/**
 * The most recent `limit` messages Postgres has, newest first: the window of history this tab loads and shows.
 * "Load earlier" widens it (`setWindow`).
 */
export const recentQuery = (messages: Collections.ElectricCollection<Message>, limit: number) =>
  Collections.liveQuery((q) =>
    q
      .from({ message: messages })
      .where(({ message }) => Collections.lt(message.position, PENDING_POSITION))
      .orderBy(({ message }) => message.position, "desc")
      .limit(limit),
  )

/** The window's collection. */
export type Recent = Effect.Success<ReturnType<typeof recentQuery>>

/** Rows this tab inserted that Postgres hasn't stored yet, in the order asked. */
export const pendingQuery = (messages: Collections.ElectricCollection<Message>) =>
  Collections.liveQuery((q) =>
    q.from({ message: messages }).where(({ message }) => Collections.gte(message.position, PENDING_POSITION)),
  )

/** The pending rows' collection. */
export type Pending = Effect.Success<ReturnType<typeof pendingQuery>>

/**
 * The conversation, in Postgres' order (`position`): the recent window, then this tab's pending rows, with this tab's
 * failed questions where they were shown.
 * - A failed answer reads the failure copy, whatever text it had streamed.
 * - A failed question shows only while neither the window nor the pending rows have it, so a question that rolled
 *   back here but reached Postgres after all shows once, as Postgres has it. It also means the rollback and the
 *   failure appear in one change.
 */
export const conversationQuery = (
  recent: Recent,
  pending: Pending,
  failures: Collections.LocalCollection<FailedMessage, string>,
) =>
  Collections.liveQuery((q) =>
    q
      .unionAll(
        q.from({ stored: recent }).select(({ stored }) => ({
          id: stored.id,
          role: stored.role,
          text: Collections.caseWhen(Collections.eq(stored.status, "failed"), CHAT_FAILED, stored.text),
          status: stored.status,
          position: stored.position,
          seq: 0,
        })),
        q.from({ asking: pending }).select(({ asking }) => ({
          id: asking.id,
          role: asking.role,
          text: asking.text,
          status: asking.status,
          position: asking.position,
          seq: 0,
        })),
        q
          .from({ failure: failures })
          .leftJoin({ stillAsking: pending }, ({ failure, stillAsking }) => Collections.eq(failure.id, stillAsking.id))
          .leftJoin({ storedAfterAll: recent }, ({ failure, storedAfterAll }) =>
            Collections.eq(failure.id, storedAfterAll.id),
          )
          .where(({ stillAsking, storedAfterAll }) =>
            Collections.and(Collections.isUndefined(stillAsking?.id), Collections.isUndefined(storedAfterAll?.id)),
          )
          .select(({ failure }) => ({
            id: failure.id,
            role: failure.role,
            text: Collections.caseWhen(Collections.eq(failure.status, "failed"), CHAT_FAILED, failure.text),
            status: failure.status,
            position: failure.position,
            seq: failure.seq,
          })),
      )
      .orderBy(({ $selected }) => $selected.position)
      .orderBy(({ $selected }) => $selected.seq),
  )

/** This tab's composer. */
export const composerQuery = (composer: Collections.LocalCollection<Composer, string>) =>
  Collections.liveQuery((q) => q.from({ composer }).findOne())

/**
 * The answer this tab asked for that is still streaming, if any: while there is one, this tab is waiting. The answer
 * is pending until Postgres stores it, then in the window, as the newest message.
 */
export const waitingQuery = (asks: Collections.LocalCollection<Ask, string>, recent: Recent, pending: Pending) =>
  Collections.liveQuery((q) =>
    q
      .unionAll(
        q
          .from({ ask: asks })
          .innerJoin({ answer: pending }, ({ ask, answer }) => Collections.eq(ask.id, answer.id))
          .where(({ answer }) => Collections.eq(answer.status, "streaming"))
          .select(({ answer }) => ({ id: answer.id })),
        q
          .from({ asked: asks })
          .innerJoin({ stored: recent }, ({ asked, stored }) => Collections.eq(asked.id, stored.id))
          .where(({ stored }) => Collections.eq(stored.status, "streaming"))
          .select(({ stored }) => ({ id: stored.id })),
      )
      .findOne(),
  )

/** This tab's sync health: `syncing`, `ready` or `failed` with a reason. */
export const syncQuery = (sync: Collections.LocalCollection<SyncHealth, string>) =>
  Collections.liveQuery((q) => q.from({ sync }).findOne())

/** This tab's history window: whether it has opened, whether "Load earlier" applies, and whether it is loading. */
export const historyQuery = (history: Collections.LocalCollection<History, string>) =>
  Collections.liveQuery((q) => q.from({ history }).findOne())
