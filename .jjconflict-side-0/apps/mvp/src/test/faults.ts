import { ShapeSource } from "@smthrs/effect-electric"
import { Context, Effect, Layer, Ref } from "effect"
import { AuthClient } from "../features/auth/api"
import { ChatClient, type Question, QuestionNotTaken } from "../features/chat/api"
import { type AppOptions, realServices } from "../boot"

// The test implementations of the services the browser reaches the world through (docs/rules.md,
// test.faults-by-injection): ChatApi's client and Electric's shape source, each the real one behind switches. Unit
// tests of unhappy paths and the end-to-end entry (src/test/e2e.ts) use them; every happy-path test uses the real ones,
// which is what proves them. Production never loads this file.

/**
 * How the next question fails, as the browser sees it:
 * - `unreachable`: offline; ChatApi never sees it;
 * - `refused`: a gateway answers 503; ChatApi never sees it;
 * - `bad_request`: ChatApi refuses it (400); it never stores it;
 * - `too_large`: a gateway refuses its body (413); ChatApi never sees it;
 * - `invalid_response`: ChatApi stores it, and its 202 is cut short;
 * - `timeout`: ChatApi stores it, and its answer comes too late, so the browser gives up;
 * - `duplicate`: the network sends it twice, so ChatApi answers the second 200;
 * - `conflict`: another writer stores a different question with its id first, so ChatApi answers 409.
 */
export type QuestionFault =
  | "unreachable"
  | "refused"
  | "bad_request"
  | "too_large"
  | "invalid_response"
  | "timeout"
  | "duplicate"
  | "conflict"

/**
 * The switch of the faulty ChatApi client: the next question fails as `fault`, and every later one goes through.
 * `asked` is every question the client was given, in order, failed or not: a test reads a question's ids from it when
 * a fault kept the question off the network.
 */
export class QuestionFaults extends Context.Service<
  QuestionFaults,
  {
    readonly failNext: (fault: QuestionFault) => Effect.Effect<void>
    readonly asked: Effect.Effect<ReadonlyArray<Question>>
  }
>()("@smthrs/mvp/test/QuestionFaults") {}

/** ChatApi's client as the layer below gives it, behind `QuestionFaults`. */
const faultyClient = Layer.effectContext(
  Effect.gen(function* () {
    const real = yield* ChatClient
    const next = yield* Ref.make<QuestionFault | undefined>(undefined)
    const asked = yield* Ref.make<ReadonlyArray<Question>>([])
    const ask = (question: Question) =>
      Effect.gen(function* () {
        yield* Ref.update(asked, (questions) => [...questions, question])
        const fault = yield* Ref.getAndSet(next, undefined)
        switch (fault) {
          case undefined:
            return yield* real.ask(question)
          case "unreachable":
            return yield* new QuestionNotTaken({ reason: "unreachable" })
          case "refused":
            return yield* new QuestionNotTaken({ reason: "refused", status: 503 })
          case "bad_request":
            return yield* new QuestionNotTaken({ reason: "refused", status: 400 })
          case "too_large":
            return yield* new QuestionNotTaken({ reason: "refused", status: 413 })
          case "invalid_response":
            yield* real.ask(question)
            return yield* new QuestionNotTaken({ reason: "invalid_response", status: 202 })
          case "timeout":
            yield* real.ask(question)
            return yield* new QuestionNotTaken({ reason: "unreachable" })
          case "duplicate":
            yield* real.ask(question)
            return yield* real.ask(question)
          case "conflict":
            yield* real.ask({ id: question.id, answerId: crypto.randomUUID(), text: "another question" })
            return yield* real.ask(question)
        }
      })
    return Context.make(ChatClient, ChatClient.of({ ask })).pipe(
      Context.add(QuestionFaults, QuestionFaults.of({ failNext: (fault) => Ref.set(next, fault), asked: Ref.get(asked) })),
    )
  }),
)

/**
 * The browser's services with switches: ChatApi's real client behind `QuestionFaults`, sign-in's real client, and
 * Electric's real shape source behind `ShapeSource.Faults`. Pass it to `appLayer` or `start` in place of
 * `realServices`. `shapes` throws the shape source's switches before the app syncs, for an app that must open with
 * sync already failing.
 */
export const faultyServices = (
  options: Pick<AppOptions, "origin" | "answerWithin">,
  shapes?: (switches: ShapeSource.Switches) => Effect.Effect<void>,
) =>
  Layer.mergeAll(
    faultyClient.pipe(Layer.provide(realServices(options))),
    AuthClient.layer({ origin: options.origin, within: options.answerWithin ?? "15 seconds" }),
    ShapeSource.layerFaulty(shapes),
  )
