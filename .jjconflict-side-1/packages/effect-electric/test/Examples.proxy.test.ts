import { ConfigProvider, Effect } from "effect"
import { expect, test } from "vitest"
import { items } from "../examples/proxy.ts"

// The runnable proxy example, as its reader would run it. A `POST` is refused before Electric is called, so this needs
// no Electric.
test("the example's handler refuses a write", async () => {
  const handler = await Effect.runPromise(
    Effect.provideService(
      items,
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ ELECTRIC_URL: "http://electric.test" })
    )
  )
  const response = await handler(new Request("http://localhost/api/shapes/items?offset=-1", { method: "POST" }))
  expect(response.status).toBe(405)
  expect(response.headers.get("allow")).toBe("GET")
})
