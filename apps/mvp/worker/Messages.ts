import { Data, Effect } from "effect"
import { SqlClient } from "effect/sql"

// Every statement ChatApi runs on the `messages` table (db/migrations, docs/features/chat.md#contract). An answer
// changes only while it is `streaming`, and only by its latest streaming attempt, so each write to one is fenced on
// both and says whether it landed.

/** What the model sees at most: this many finished exchanges, of at most this many characters in all. */
export const MAX_EXCHANGES = 19
export const MAX_HISTORY_CHARACTERS = 24_000

/** An answer still `streaming` whose `updated_at` is older than this is stuck: the sweep dispatches it again. */
export const STUCK_AFTER_SECONDS = 60

/** The sweep settles a stuck answer as abandoned once answering it has started this many times, */
export const MAX_ATTEMPTS = 3

/** or once it is this old. */
export const MAX_AGE_SECONDS = 600

/** Why an answer failed. A question ChatApi never got fails only in the asking browser, never here. */
export type Failure = "rate_limited" | "model_error" | "empty" | "abandoned"

/** How an answer settles: its status, and what the model reported. */
export interface Settlement {
  readonly status: "done" | "failed"
  readonly failure?: Failure | undefined
  readonly modelId: string
  readonly stopReason?: string | undefined
  readonly inputTokens?: number | undefined
  readonly outputTokens?: number | undefined
}

/** One finished exchange of the conversation. */
export interface Exchange {
  readonly question: string
  readonly answer: string
}

/** A question's id is taken by a different message: another question, another answer id, or an answer. */
export class IdTaken extends Data.TaggedError("IdTaken")<{}> {}

/**
 * What asking did: inserted both rows in the transaction `txid`, or found this exact question already asked
 * (`txid: null`), with whether its answer is still `streaming`.
 */
export type Asked =
  | { readonly txid: number }
  | { readonly txid: null; readonly streaming: boolean }

/**
 * Inserts the question and its empty streaming answer in one transaction. Its ids are lowercase, as Postgres prints
 * them. When a message with the question's id exists, nothing changes: it is a retry if it is the same question
 * (role `user`, same text, same answer id), and `IdTaken` otherwise. Asks take a transaction lock, so each question's
 * answer takes the next position and transactions commit in position order.
 */
export const ask = (question: { readonly id: string; readonly answerId: string; readonly text: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`SELECT pg_advisory_xact_lock(hashtext('smithers.messages.ask'))`
        const inserted = yield* sql`
          INSERT INTO messages (id, role, text, status) VALUES (${question.id}, 'user', ${question.text}, 'done')
          ON CONFLICT (id) DO NOTHING
          RETURNING id`
        if (inserted.length === 0) {
          const [existing] = yield* sql<{
            readonly role: string
            readonly text: string
            readonly answerId: string | null
            readonly status: string | null
          }>`
            SELECT q.role, q.text, a.id AS "answerId", a.status
            FROM messages q LEFT JOIN messages a ON a.question_id = q.id
            WHERE q.id = ${question.id}`
          const same = existing !== undefined && existing.role === "user" && existing.text === question.text &&
            existing.answerId === question.answerId
          if (!same) return yield* new IdTaken()
          return { txid: null, streaming: existing.status === "streaming" } satisfies Asked
        }
        const [answer] = yield* sql<{ readonly txid: string }>`
          INSERT INTO messages (id, role, status, question_id)
          VALUES (${question.answerId}, 'assistant', 'streaming', ${question.id})
          RETURNING pg_current_xact_id()::xid::text AS txid`
        return { txid: Number(answer!.txid) } satisfies Asked
      }),
    )
  })

/** The answer's status and its question, or `undefined` when there is no such answer. */
export const answerTarget = (answerId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly status: string; readonly questionId: string; readonly question: string }>`
      SELECT a.status, q.id AS "questionId", q.text AS question
      FROM messages a JOIN messages q ON q.id = a.question_id
      WHERE a.id = ${answerId}`
    return row
  })

/**
 * The history the model sees before an answer, oldest first: the most recent finished (`done`) exchanges before
 * it, stopping at the first one, going back, that would pass `MAX_EXCHANGES` or `MAX_HISTORY_CHARACTERS`.
 */
export const history = (answerId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql<Exchange>`
      SELECT question, answer FROM (
        SELECT q.text AS question, a.text AS answer, a.position,
          sum(char_length(q.text) + char_length(a.text)) OVER (ORDER BY a.position DESC) AS characters
        FROM messages a JOIN messages q ON q.id = a.question_id
        WHERE a.status = 'done' AND a.position < (SELECT position FROM messages WHERE id = ${answerId})
        ORDER BY a.position DESC
        LIMIT ${MAX_EXCHANGES}
      ) recent
      WHERE characters <= ${MAX_HISTORY_CHARACTERS}
      ORDER BY position`
  })

/**
 * Starts a streaming attempt: empties the answer's text and takes the next attempt number, which fences out every
 * earlier attempt. `undefined`: the answer has settled, and nothing changed.
 */
export const claim = (answerId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ readonly attempts: number }>`
      UPDATE messages SET text = '', attempts = attempts + 1, updated_at = now()
      WHERE id = ${answerId} AND status = 'streaming'
      RETURNING attempts`
    return row?.attempts
  })

/** Appends text to a streaming answer. `false`: it has settled or a later attempt claimed it, and nothing changed. */
export const append = (answerId: string, attempt: number, text: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      UPDATE messages SET text = text || ${text}, updated_at = now()
      WHERE id = ${answerId} AND status = 'streaming' AND attempts = ${attempt}
      RETURNING id`
    return rows.length === 1
  })

/** Settles a streaming answer in one update. `false`: it has settled or a later attempt claimed it. */
export const settle = (answerId: string, attempt: number, settlement: Settlement) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      UPDATE messages SET
        status = ${settlement.status},
        failure = ${settlement.failure ?? null},
        model_id = ${settlement.modelId},
        stop_reason = ${settlement.stopReason ?? null},
        input_tokens = ${settlement.inputTokens ?? null},
        output_tokens = ${settlement.outputTokens ?? null},
        updated_at = now()
      WHERE id = ${answerId} AND status = 'streaming' AND attempts = ${attempt}
      RETURNING id`
    return rows.length === 1
  })

/**
 * The stuck answers: streaming with no write for `STUCK_AFTER_SECONDS`. Settles those that answering started
 * `MAX_ATTEMPTS` times, or that are older than `MAX_AGE_SECONDS`, as abandoned, and returns their ids as
 * `abandoned`; the rest, in `stuck`, are the sweep's to dispatch again.
 */
export const sweep = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const abandoned = yield* sql<{ readonly id: string }>`
    UPDATE messages SET status = 'failed', failure = 'abandoned', updated_at = now()
    WHERE status = 'streaming' AND updated_at < now() - make_interval(secs => ${STUCK_AFTER_SECONDS})
      AND (attempts >= ${MAX_ATTEMPTS} OR created_at < now() - make_interval(secs => ${MAX_AGE_SECONDS}))
    RETURNING id`
  const stuck = yield* sql<{ readonly id: string }>`
    SELECT id FROM messages
    WHERE status = 'streaming' AND updated_at < now() - make_interval(secs => ${STUCK_AFTER_SECONDS})
    ORDER BY position`
  return { abandoned: abandoned.map((row) => row.id), stuck: stuck.map((row) => row.id) }
})
