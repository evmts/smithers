import { Events, makeSchema, Schema, SessionIdSymbol, State } from "@livestore/livestore"

export const CHAT_FAILED = "Smithers couldn't answer. Try again."

// The longest question a person can ask, in characters.
export const QUESTION_MAX_LENGTH = 8_000

export const tables = {
  // The conversation, synced to every device on the store.
  messages: State.SQLite.table({
    name: "messages",
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      role: State.SQLite.text({ schema: Schema.Literals(["user", "assistant"]) }),
      text: State.SQLite.text({ default: "" }),
      status: State.SQLite.text({ schema: Schema.Literals(["done", "streaming", "failed"]) }),
      // The browser tab (LiveStore session) that asked; only it fetches the answer.
      askedBy: State.SQLite.text({ default: "" }),
      // The conversation's order: the event log's, which every device shares, never a device's clock.
      position: State.SQLite.integer({ default: 0 }),
      createdAt: State.SQLite.integer(),
    },
  }),
  // The composer belongs to one browser tab: open or hidden, and the unsent draft.
  composer: State.SQLite.clientDocument({
    name: "composer",
    schema: Schema.Struct({ open: Schema.Boolean, draft: Schema.String }),
    default: { id: SessionIdSymbol, value: { open: false, draft: "" } },
  }),
}

export const events = {
  // A question and the empty answer it awaits, in one event so every device sees both or neither.
  questionAsked: Events.synced({
    name: "v1.QuestionAsked",
    schema: Schema.Struct({
      id: Schema.String,
      text: Schema.String,
      answerId: Schema.String,
      askedBy: Schema.String,
      createdAt: Schema.Number,
    }),
  }),
  // The next piece of the answer, committed a few times a second while Smithers streams.
  answerDelta: Events.synced({ name: "v1.AnswerDelta", schema: Schema.Struct({ id: Schema.String, text: Schema.String }) }),
  answerCompleted: Events.synced({ name: "v1.AnswerCompleted", schema: Schema.Struct({ id: Schema.String }) }),
  answerFailed: Events.synced({ name: "v1.AnswerFailed", schema: Schema.Struct({ id: Schema.String }) }),
  composerSet: tables.composer.set,
}

const materializers = State.SQLite.materializers(events, {
  "v1.QuestionAsked": ({ id, text, answerId, askedBy, createdAt }) =>
    [
      { id, role: "user", text, status: "done", askedBy: "" },
      { id: answerId, role: "assistant", text: "", status: "streaming", askedBy },
    ].map((row) => ({
      sql: `INSERT INTO messages (id, role, text, status, askedBy, position, createdAt)
            VALUES ($id, $role, $text, $status, $askedBy, (SELECT COALESCE(MAX(position), 0) + 1 FROM messages), $createdAt)`,
      bindValues: { ...row, createdAt },
      writeTables: new Set(["messages"]),
    })),
  // An answer only changes while it streams: once done or failed, later events for it change nothing.
  "v1.AnswerDelta": ({ id, text }) => ({
    sql: "UPDATE messages SET text = text || $text WHERE id = $id AND status = 'streaming'",
    bindValues: { text, id },
    writeTables: new Set(["messages"]),
  }),
  "v1.AnswerCompleted": ({ id }) => tables.messages.update({ status: "done" }).where({ id, status: "streaming" }),
  "v1.AnswerFailed": ({ id }) =>
    tables.messages.update({ text: CHAT_FAILED, status: "failed" }).where({ id, status: "streaming" }),
})

export const schema = makeSchema({ events, state: State.SQLite.makeState({ tables, materializers }) })
