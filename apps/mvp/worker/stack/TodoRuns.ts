import { Cause, Effect, Option, Schema } from "effect"
import { todoExecutionId } from "../../src/features/pulls/contract.ts"
import { codeOf } from "../ErrorCode.ts"
import type { FlowStarter } from "../Flows.ts"
import * as Todo from "../flows/Todo.ts"
import * as TodoDrop from "../flows/TodoDrop.ts"
import * as Stack from "./Stack.ts"

/** The production adapter from persisted stack receipts to remote executions. */
export const make = (
  starter: FlowStarter["Service"],
  cancel: (executionId: string) => Effect.Effect<void, unknown>,
): Stack.TodoRuns["Service"] => Stack.TodoRuns.of({
  start: (attempt) => starter.start(Todo.Todo, { executionId: todoExecutionId(attempt.attemptId), payload: attempt }).pipe(
    Effect.catch((error) => error._tag === "@smthrs/mvp/flows/StartConflict"
      ? Effect.void : Effect.fail(new Stack.RunsUnavailable({ errorCode: error.errorCode }))),
  ),
  stop: (attempt) => cancel(todoExecutionId(attempt.attemptId)).pipe(
    Effect.catchCause((cause) => Cause.hasInterrupts(cause)
      ? Effect.interrupt
      : Effect.fail(new Stack.RunsUnavailable({ errorCode: codeOf(Cause.squash(cause)) }))),
    Effect.andThen(starter.start(TodoDrop.Drop, {
      executionId: `todo-drop:${attempt.attemptId}`,
      payload: { attemptId: attempt.attemptId, todoId: attempt.todoId },
    }).pipe(Effect.catch((error) => error._tag === "@smthrs/mvp/flows/StartConflict"
      ? Effect.void : Effect.fail(new Stack.RunsUnavailable({ errorCode: error.errorCode }))))),
  ),
})

/** Whether this attempt still belongs to a live TODO. */
export const mayStart = (attempt: Stack.AttemptStart) => Stack.attemptTodo(attempt).pipe(
  Effect.map((todo) => Option.isSome(todo) && todo.value.attempt === attempt.ordinal &&
    (todo.value.state === "working" || todo.value.state === "in_review")),
)

/** Recheck delayed TODO admission; other remote flows have their own admission policy. */
export const canStart = (intent: { readonly flow: string; readonly payload: unknown }) => intent.flow !== Todo.Todo._tag ? Effect.succeed(true) :
  Schema.decodeUnknownEffect(Todo.TodoRequest)(intent.payload).pipe(
    Effect.flatMap(mayStart), Effect.orDie,
  )
