/**
 * The quickstart: an in-memory collection of todos checked by a schema, a live
 * query over it, typed mutations, and the query's rows as a stream.
 *
 * Run it with `node examples/quickstart.ts`.
 */
import { Collection, LiveQuery, Query } from "@smthrs/effect-tanstack-db"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

/** A todo, as every row of the collection must be. */
export const Todo = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean })
export type Todo = typeof Todo.Type

/**
 * Adds two todos, finishes one, and tries to add a duplicate. Returns the open
 * todos before and after, the first result the query's stream emits, and the
 * error the duplicate failed with.
 */
export const program = Effect.scoped(Effect.gen(function*() {
  const todos = yield* Collection.local({ id: "todos", schema: Todo, getKey: (todo) => todo.id })
  const open = yield* LiveQuery.make((q) =>
    q
      .from({ todo: todos.tanstack })
      .where(({ todo }) => Query.eq(todo.done, false))
      .orderBy(({ todo }) => todo.title)
      .select(({ todo }) => ({ id: todo.id, title: todo.title }))
  )
  yield* open.preload
  yield* todos.insert([
    { id: "1", title: "Write the docs", done: false },
    { id: "2", title: "Ship it", done: false }
  ])
  const before = (yield* open.toArray).map(({ title }) => title)
  yield* todos.update("1", (todo) => {
    todo.done = true
  })
  const after = (yield* open.toArray).map(({ title }) => title)
  const streamed = yield* Stream.runHead(open.rows)
  const duplicate = yield* Effect.flip(todos.insert({ id: "2", title: "Ship it again", done: false }))
  return {
    before,
    after,
    streamed: streamed._tag === "Some" ? streamed.value.map(({ title }) => title) : [],
    duplicate: `${duplicate._tag}:${duplicate.operation}`
  }
}))

if (import.meta.main) {
  console.log(await Effect.runPromise(program))
}
