import { Effect, Layer } from "effect"
import { answerAskingTab } from "../../flows/askingTab"
import { todosChannel } from "./contract"
import { TodosCall } from "./schema"
import { TodosStore } from "./store"

// The tab's side of the TODO steps (docs/features/todos.md#flows): every tab listens on the engine's todos channel, and
// only the tab that started a call's request answers it (src/flows/askingTab.ts), keeping a draft on the device or
// putting a change in the device's outbox. Every other tab, and every other device, leaves it alone. Calls are answered
// one at a time, so a step asking again for a draft or change still being kept finds it kept.

/** Answers the todos channel of engine `name` for this tab's requests until its scope closes. */
export const tabTodos = (host: { readonly name: string }) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const store = yield* TodosStore
      yield* answerAskingTab({
        channel: todosChannel(host.name),
        input: TodosCall,
        answer: (call) => (call.kind === "draft" ? store.keepDraft(call.draft) : store.queue(call.op)),
      })
    }),
  )
