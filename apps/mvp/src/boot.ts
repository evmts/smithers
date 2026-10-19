import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { answerQuestions } from "./features/chat/answerer"
import { chatShortcuts } from "./features/chat/shortcuts"
import { appStoreLive } from "./livestore/store"

// The browser program: bind the chat keys and answer this tab's questions until the tab closes.
// main.tsx runs it once; nothing else in the app runs an Effect.
export const boot = Effect.gen(function* () {
  yield* chatShortcuts(window)
  yield* answerQuestions(`${window.location.origin}/api/chat`)
}).pipe(
  Effect.scoped,
  Effect.provide(Layer.mergeAll(appStoreLive, FetchHttpClient.layer)),
  Effect.tapCause((cause) => Effect.logError("chat stopped", cause)),
)
