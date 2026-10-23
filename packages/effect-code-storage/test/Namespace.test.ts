import { Effect, Layer, Redacted } from "effect"
import { FetchHttpClient } from "effect/http"
import { beforeAll, expect, test } from "vitest"
import { CodeStorage } from "../src/index.ts"
import { decodeClaims, keyPair } from "./fixtures.ts"

let pem: string
beforeAll(async () => {
  ;({ pem } = await keyPair())
})

// A faulty transport observes the real signed request and refuses it before network I/O.
// No successful provider response is simulated.
const capture = async (call: (client: CodeStorage.Client) => Effect.Effect<unknown, CodeStorage.CodeStorageError>) => {
  let sent: Request | undefined
  const layer = CodeStorage.CodeStorage.layer({ org: "acme", key: Redacted.make(pem) }).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, async (input, init) => {
      sent = new Request(input, init)
      throw new Error("injected transport outage")
    }))
  )
  const error = await Effect.runPromise(CodeStorage.CodeStorage.use(call).pipe(Effect.flip, Effect.provide(layer)))
  expect(error.code).toBe("transport")
  return sent!
}

test.each(["default", "ephemeral"] as const)("creation selects both namespaces: %s", async (namespace) => {
  const sent = await capture((client) =>
    client.createBranch("github/o/r", {
      branch: "conversation",
      from: "main",
      namespace,
      fromNamespace: namespace
    })
  )
  expect(await sent.json()).toEqual({
    base_ref: "main",
    target_branch: "conversation",
    base_is_ephemeral: namespace === "ephemeral",
    target_is_ephemeral: namespace === "ephemeral"
  })
  expect(decodeClaims(sent.headers.get("authorization")!.slice(7))).toMatchObject({
    repo: "github/o/r",
    scopes: ["git:write"]
  })
})

test.each(["default", "ephemeral"] as const)("read operations select the %s namespace", async (namespace) => {
  const calls = [
    (client: CodeStorage.Client) => client.listFiles("github/o/r", { ref: "conversation", namespace }),
    (client: CodeStorage.Client) =>
      client.readFile("github/o/r", { ref: "conversation", path: "README.md", maxBytes: 64, namespace }),
    (client: CodeStorage.Client) => client.listCommits("github/o/r", { ref: "conversation", namespace }),
    (client: CodeStorage.Client) => client.listBranches("github/o/r", { namespace })
  ]
  for (const call of calls) {
    const sent = await capture(call)
    expect(new URL(sent.url).searchParams.get("ephemeral")).toBe(String(namespace === "ephemeral"))
  }
})

test("ephemeral git remote preserves the repository token claim and encodes names before the namespace suffix", async () => {
  const remote = await Effect.runPromise(
    CodeStorage.CodeStorage.use((client) => client.gitRemote("github/o/a b", "ephemeral")).pipe(
      Effect.provide(
        CodeStorage.CodeStorage.layer({ org: "acme", key: Redacted.make(pem) }).pipe(
          Layer.provide(FetchHttpClient.layer)
        )
      )
    )
  )
  expect(remote.url).toBe("https://acme.code.storage/github/o/a%20b+ephemeral.git")
  const token = atob(Redacted.value(remote.authorization!).slice(6)).slice(2)
  expect(decodeClaims(token)).toMatchObject({ repo: "github/o/a b", scopes: ["git:read"] })
})
