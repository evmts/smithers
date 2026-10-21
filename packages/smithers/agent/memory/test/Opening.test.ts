import { Effect, Exit, Layer } from "effect"
import { describe, expect, test } from "vitest"
import { Flows, Opening, RecallKeyword, Source } from "../src/index.ts"
import * as TestMemory from "../src/test/TestMemory.ts"

const candidates: ReadonlyArray<Opening.Candidate> = [
  { kind: "memory", bank: "agent-chat", key: "release", text: "release code is cobalt" },
  { kind: "skill", bank: "skills", key: "release-guide", text: "release instructions" },
  { kind: "memory", bank: "agent-chat", key: "unrelated", text: "gardening" }
]
const select = (overrides: Partial<Parameters<typeof Opening.select<string, never>>[0]> = {}) =>
  Opening.select({
    query: "release",
    candidates,
    tokenBudget: 4096,
    judge: (items) =>
      Effect.succeed(items.map((_, index) => ({ index, unnecessary: index / 3, withheld: index === 2 }))),
    ...overrides
  })

describe("opening selection", () => {
  test("ranks a shared memory and skill shortlist and fences whole rows", async () => {
    const result = await Effect.runPromise(select())
    expect(result).toMatchObject({
      recalled: 3,
      judged: 3,
      inserted: 2,
      filtered: 1,
      skillsRecalled: 1,
      skillsInserted: 1
    })
    expect(result.rows.map((row) => row.key)).toEqual(["release", "release-guide"])
    expect(result.bytes).toBe(new TextEncoder().encode(Source.render(result.rows)).length)
    expect(Opening.shortlist("RELEASE release", candidates, 1)).toEqual([candidates[0]])
    expect(Opening.shortlist("!!!", candidates)).toEqual(candidates)
    expect(Opening.shortlist("", candidates, NaN)).toEqual([])
    expect(Opening.shortlist("", candidates, -1)).toEqual([])
  })
  test("budgets the complete escaped context, skips oversized rows and retains smaller ones", async () => {
    const result = await Effect.runPromise(select({
      candidates: [{ ...candidates[0]!, text: "x".repeat(1000) }, candidates[1]!],
      tokenBudget: 200
    }))
    expect(result.rows.map((row) => row.key)).toEqual(["release-guide"])
    for (const tokenBudget of [0, -1, NaN, Infinity]) {
      expect((await Effect.runPromise(select({ tokenBudget }))).rows).toEqual([])
    }
    for (const tokens of [() => NaN, () => -1, () => 5000]) {
      expect((await Effect.runPromise(select({ tokens }))).rows).toEqual([])
    }
    expect((await Effect.runPromise(select({ tokenBudget: 1, tokens: () => 1 }))).inserted).toBe(2)
  })
  test("rejects malformed, duplicate and withheld verdicts and stabilizes equal ranks", async () => {
    const result = await Effect.runPromise(select({
      judge: () =>
        Effect.succeed([
          { index: -1, unnecessary: 0, withheld: false },
          { index: 3, unnecessary: 0, withheld: false },
          { index: 0.5, unnecessary: 0, withheld: false },
          { index: 0, unnecessary: NaN, withheld: false },
          { index: 0, unnecessary: -1, withheld: false },
          { index: 0, unnecessary: 2, withheld: false },
          { index: 1, unnecessary: 0.5, withheld: false },
          { index: 1, unnecessary: 0, withheld: false },
          { index: 0, unnecessary: 0.5, withheld: false },
          { index: 2, unnecessary: 0.1, withheld: true }
        ])
    }))
    expect(result.rows.map((row) => row.key)).toEqual(["release", "release-guide"])
    expect((await Effect.runPromise(select({ candidates: [], judge: () => Effect.die("must not ask") }))).bytes).toBe(0)
    expect(Exit.isFailure(await Effect.runPromiseExit(select({ judge: () => Effect.fail("unreachable") })))).toBe(true)
    expect(Exit.isFailure(await Effect.runPromiseExit(select({ judge: () => Effect.interrupt })))).toBe(true)
  })
  test("recalls actual SQL facts through injected sources and joins host skills", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function*() {
        yield* Flows.runRemember({ bank: "agent-chat", key: "release", text: "release code is cobalt" })
        const sources = yield* Opening.Sources
        return yield* sources.recall("release")
      }).pipe(Effect.provide(
        Opening.layerSources(["agent-chat"], [candidates[1]!]).pipe(
          Layer.provideMerge(RecallKeyword.layer),
          Layer.provideMerge(TestMemory.layer)
        )
      ))
    )
    expect(result.map((row) => row.kind)).toEqual(["memory", "skill"])
    expect(result[0]?.text).toContain("cobalt")
    const empty = await Effect.runPromise(
      Effect.flatMap(Opening.Sources, (sources) => sources.recall("nothing")).pipe(
        Effect.provide(
          Opening.layerSources(["agent-chat"]).pipe(Layer.provide(RecallKeyword.layer), Layer.provide(TestMemory.layer))
        )
      )
    )
    expect(empty).toEqual([])
  })
})

test("busy banks cannot starve skills; ranking ignores boilerplate and substring coincidences", () => {
  const memories = Array.from(
    { length: 40 },
    (_, i): Opening.Candidate => ({ kind: "memory", bank: "agent-chat", key: String(i), text: "release" })
  )
  const skills = Array.from(
    { length: 20 },
    (_, i): Opening.Candidate => ({ kind: "skill", bank: "skills", key: `s${i}`, text: "release" })
  )
  const result = Opening.shortlist("the release is now", [...memories, ...skills])
  expect(result.filter((item) => item.kind === "skill")).toHaveLength(15)
  expect(result).toHaveLength(30)
  expect(Opening.shortlist("release", memories, 3)).toEqual(memories.slice(0, 3))
  expect(Opening.shortlist("release", skills, 3)).toEqual(skills.slice(0, 3))
  expect(Opening.shortlist("release", [...memories, skills[0]!], 5)).toHaveLength(5)
  expect(Opening.shortlist("release", [...memories, skills[0]!], 1)).toEqual([memories[0]])
  expect(Opening.shortlist("it", [{ ...memories[0]!, text: "with" }, { ...skills[0]!, text: "it" }], 2)).toHaveLength(2)
})

test("conversation wrapper names do not outweigh the requested subject", () => {
  const wrapper: Opening.Candidate = { kind: "memory", bank: "agent-chat", key: "wrapper", text: "Smithers far" }
  const relevant: Opening.Candidate = { kind: "memory", bank: "agent-chat", key: "subject", text: "release" }
  expect(Opening.shortlist("Smithers far release", [wrapper, relevant], 1)).toEqual([relevant])
})

test("long conversations keep their newest query within the recall byte limit without broken Unicode", () => {
  expect(Opening.boundedQuery("old history " + "x".repeat(20_000) + " new question")).toHaveLength(16_384)
  expect(Opening.boundedQuery("old🙂new", 7)).toBe("🙂new")
  expect(Opening.boundedQuery("old🙂new", 6)).toBe("new")
  expect(Opening.boundedQuery("short", 100)).toBe("short")
  for (const budget of [0, -1, NaN, Infinity]) expect(Opening.boundedQuery("private", budget)).toBe("")
})
