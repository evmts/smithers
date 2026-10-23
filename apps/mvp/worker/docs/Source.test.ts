import { ConfigProvider, Effect } from "effect"
import { FetchHttpClient } from "effect/http"
import { expect, test } from "vitest"
import * as Source from "./Source.ts"

test("docs settings are captured without acquiring a runtime cache", async () => {
  // Alchemy's Node build has no ImmutableCache/Worker cache service. Only runtime service construction needs it.
  const config: Record<string, string> = { DOCS_KEPT: "7 seconds", GITHUB_API_URL: "https://github.example.test" }
  const captured = await Effect.runPromise(Source.settings.pipe(
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(config)),
  ))
  delete config.DOCS_KEPT
  expect(captured.kept).toBe(7000)
  expect(captured.about.apiBaseUrl).toBe("https://github.example.test")
})
