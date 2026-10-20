import { Data, Effect } from "effect"
import { SqlClient } from "effect/sql"

// The statements ChatApi runs on the `messages` table when someone asks, and the history an answer's turn reads
// (db/migrations, docs/features/chat.md#contract). The answer routes' own writes are in worker/Answers.ts.

/** What the model sees at most: this many finished exchanges, of at most this many characters in all. */
const MAX_EXCHANGES = 19
const MAX_HISTORY_CHARACTERS = 24_000

/** One finished exchange of the conversation. */
export interface Exchange {
  readonly question: string
  readonly answer: string
}

/** A question's id is taken by a different message: another question, another answer id, or an answer. */
export class IdTaken extends Data.TaggedError("IdTaken")<{}> {}

/** What asking did: inserted both rows in the transaction `txid`, or found this exact question asked (`null`). */
type Asked = { readonly txid: number | null }

/**
 * Inserts the question and its empty streaming answer in one statement, so in one transaction, both in the
 * conversation `conversationId` (decision 0013 §1). The question draws its
 * position from the identity, which steps by 2, and the answer takes the next one, so no other row lands between them
 * and asking takes no lock (db/migrations/0003_paired_positions.ts). Ids are lowercase, as Postgres prints them.
 * `askedBy` is the asking actor's person id, from the session (worker/Chat.ts): only that person may write the answer
 * (worker/Answers.ts). When a message with the question's id exists, nothing changes: it is a retry if it is the same
 * question (role `user`, same text, same answer id, same asker, same conversation), and `IdTaken` otherwise. An answer id another message
 * has fails the statement with a unique violation, and nothing is written.
 */
export const ask = (question: {
  readonly id: string
  readonly answerId: string
  readonly conversationId: string
  readonly text: string
  readonly askedBy: string
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const [inserted] = yield* sql<{ readonly txid: string }>`
      WITH question AS (
        INSERT INTO messages (id, role, text, status, asked_by, conversation_id)
        VALUES (${question.id}, 'user', ${question.text}, 'done', ${question.askedBy}, ${question.conversationId})
        ON CONFLICT (id) DO NOTHING
        RETURNING position
      )
      INSERT INTO messages (id, role, status, question_id, position, conversation_id) OVERRIDING SYSTEM VALUE
      SELECT ${question.answerId}, 'assistant', 'streaming', ${question.id}, position + 1, ${question.conversationId}
      FROM question
      RETURNING pg_current_xact_id()::xid::text AS txid`
    if (inserted !== undefined) return { txid: Number(inserted.txid) } satisfies Asked
    const [existing] = yield* sql<{
      readonly role: string
      readonly text: string
      readonly answerId: string | null
      readonly askedBy: string | null
      readonly conversationId: string
    }>`
      SELECT q.role, q.text, a.id AS "answerId", q.asked_by AS "askedBy", q.conversation_id AS "conversationId"
      FROM messages q LEFT JOIN messages a ON a.question_id = q.id
      WHERE q.id = ${question.id}`
    const same = existing !== undefined && existing.role === "user" && existing.text === question.text &&
      existing.answerId === question.answerId && existing.askedBy === question.askedBy &&
      existing.conversationId === question.conversationId
    if (!same) return yield* new IdTaken()
    return { txid: null } satisfies Asked
  })

/**
 * The history the model sees before an answer, oldest first: the most recent finished (`done`) exchanges before
 * it in its own conversation, stopping at the first one, going back, that would pass `MAX_EXCHANGES` or `MAX_HISTORY_CHARACTERS`.
 */
export const history = (answerId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql<Exchange>`
      SELECT question, answer FROM (
        SELECT q.text AS question, a.text AS answer, a.position,
          sum(char_length(q.text) + char_length(a.text)) OVER (ORDER BY a.position DESC) AS characters
        FROM messages a JOIN messages q ON q.id = a.question_id
        JOIN messages t ON t.id = ${answerId}
        WHERE a.status = 'done' AND a.conversation_id = t.conversation_id AND a.position < t.position
        ORDER BY a.position DESC
        LIMIT ${MAX_EXCHANGES}
      ) recent
      WHERE characters <= ${MAX_HISTORY_CHARACTERS}
      ORDER BY position`
  })
