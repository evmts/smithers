import { ConfigProvider, Effect } from "effect"
import { expect, test } from "vitest"
import * as TestDatabase from "./TestDatabase.ts"

const configured = <A, E>(effect: Effect.Effect<A, E>, values: Record<string, string>) =>
  Effect.runPromise(effect.pipe(Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(values))))

test("an explicit localhost test port isolates the database without allowing another host or port", async () => {
  const values = { TEST_DATABASE_PORT: "55441", DATABASE_URL: "postgresql://smithers:smithers@localhost:55441/smithers" }
  expect((await configured(TestDatabase.serverUrl, values)).port).toBe("55441")
  for (const database of ["postgresql://owner:PRIVATE@db.example.com:55441/prod", "postgresql://owner:PRIVATE@localhost:54321/prod"]) {
    const failure = await configured(Effect.flip(TestDatabase.serverUrl), { ...values, DATABASE_URL: database })
    expect(failure).toBeInstanceOf(TestDatabase.Unusable)
    expect(String(failure)).not.toContain("PRIVATE")
  }
})

test("an isolated Electric endpoint stays on localhost", async () => {
  expect(await configured(TestDatabase.electricUrl, { TEST_ELECTRIC_PORT: "30441" })).toBe("http://localhost:30441")
  expect(await configured(TestDatabase.electricUrl, {})).toBe("http://localhost:30001")
})
