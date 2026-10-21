import { Effect, Exit, Layer } from "effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import { HttpClient } from "effect/http/HttpClient"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { expect, test } from "vitest"
import { providerTransport } from "../src/ProviderTransport.ts"

test("uses the host's injected fetch and preserves explicit transport precedence", async () => {
  const seen: string[] = []
  const server = createServer((request, response) => {
    seen.push(request.headers["x-transport"] as string)
    response.writeHead(204)
    response.end()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const fetch = (name: string): typeof globalThis.fetch =>
    ((input: RequestInfo | URL, init?: RequestInit) =>
      globalThis.fetch(input, {
        ...init,
        headers: { ...Object.fromEntries(new Headers(init?.headers)), "x-transport": name }
      })) as typeof globalThis.fetch
  try {
    for (const explicit of [undefined, fetch("explicit")]) {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function*() {
          return (yield* (yield* HttpClient).get(url)).status
        }).pipe(Effect.provide(
          providerTransport(explicit).pipe(
            Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch("host")))
          )
        ))
      )
      expect(exit).toEqual(Exit.succeed(204))
    }
    expect(seen).toEqual(["host", "explicit"])
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
