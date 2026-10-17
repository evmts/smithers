/**
 * The Effect forms of four patterns, run without a flow engine.
 *
 * Each pattern's `run` takes plain Effects as members, so a script or a test
 * can use the same contract its declared form puts in a plan.
 */
import * as Bounded from "@smthrs/patterns/Bounded"
import * as Quarantine from "@smthrs/patterns/Quarantine"
import * as ReviewLoop from "@smthrs/patterns/ReviewLoop"
import * as WithRetry from "@smthrs/patterns/WithRetry"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"

/**
 * Drafts a title, then revises it until the reviewer approves or two rounds
 * pass. The reviewer approves a title of at most 20 characters.
 */
export const reviewTitle = (draft: string) =>
  ReviewLoop.run(draft, {
    produce: (input: string) => Effect.succeed(input),
    review: (title: string) => Effect.succeed({ approved: title.length <= 20, length: title.length }),
    revise: ({ output }) => Effect.succeed(output.slice(0, 20)),
    maxRounds: 2
  })

/**
 * Starts three checks at most two at a time, highest priority first, and
 * records the order they started in.
 */
export const rankedChecks = Effect.gen(function*() {
  const started = yield* Ref.make<ReadonlyArray<string>>([])
  const check = (name: string) => Effect.as(Ref.update(started, (names) => [...names, name]), `${name}: ok`)
  const results = yield* Bounded.run(
    { docs: check("docs"), web: check("web"), api: check("api") },
    { concurrency: 2, priorities: { api: 2, web: 1, docs: 0 } }
  )
  return { results, order: yield* Ref.get(started) }
})

/**
 * Runs three checks so a failed one is quarantined while its siblings still
 * finish, then settles the outcomes into values or one `quarantined` error
 * naming every failed check.
 */
export const checkRepositories = (broken: ReadonlyArray<string>) => {
  const check = (name: string) =>
    broken.includes(name) ? Effect.fail(`${name}: tests failed`) : Effect.succeed(`${name}: ok`)
  return Quarantine.run(
    { api: check("api"), web: check("web"), docs: check("docs") },
    { policy: "quarantine", concurrency: 2 }
  ).pipe(Effect.flatMap(Quarantine.settle))
}

/**
 * Calls a member that fails `failures` times before it answers, with three
 * attempts in total.
 */
export const fetchWithRetry = (failures: number) =>
  Effect.gen(function*() {
    const calls = yield* Ref.make(0)
    const flaky = Ref.updateAndGet(calls, (count) => count + 1).pipe(
      Effect.flatMap((count) => count <= failures ? Effect.fail(`attempt ${count} failed`) : Effect.succeed(count))
    )
    return yield* WithRetry.retryEffect(flaky, { attempts: 3 })
  })
