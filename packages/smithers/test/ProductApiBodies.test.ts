import { it } from "@effect/vitest"
import { Effect } from "effect"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { describe, expect } from "vitest"
import { Client } from "../src/internal/backend/Client.ts"
import * as ProductApi from "../src/internal/backend/ProductApi.ts"

// A real HTTP echo endpoint exercises the wrappers and the production transport.
// Listening and closing are scoped, so assertion failures also release the port.
const client = Effect.acquireRelease(
  Effect.tryPromise(async () => {
    const server = createServer(async (request, response) => {
      const chunks: Array<Buffer> = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const bytes = Buffer.concat(chunks)
      const contentType = request.headers["content-type"]
      response.setHeader("content-type", "application/json")
      response.end(JSON.stringify({
        method: request.method,
        path: request.url,
        contentType,
        body: contentType === "application/json"
          ? (bytes.length === 0 ? "" : JSON.parse(bytes.toString()))
          : Array.from(bytes)
      }))
    })
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    return {
      server,
      transport: new Client({
        environment: {
          SMITHERS_API_ORIGIN: origin,
          SMITHERS_TOKEN: "loopback-test-token",
          SMITHERS_DISABLE_SYSTEM_KEYRING: "1"
        }
      })
    }
  }),
  ({ server }) =>
    Effect.promise(() =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
        server.closeAllConnections()
      })
    )
)

const org = { org: "org /?#" }
const repo = { owner: "owner /?#", repo: "repo /?#" }
const base = "/api/repos/owner%20%2F%3F%23/repo%20%2F%3F%23"

const mutations = [
  {
    name: "organization-member creation",
    method: "POST",
    path: "/api/orgs/org%20%2F%3F%23/members",
    body: { username: "new-member" },
    send: (transport: Client, body: unknown) => ProductApi.postApiOrgsOrgMembers(transport, { path: org, body })
  },
  {
    name: "organization-variable creation",
    method: "POST",
    path: "/api/orgs/org%20%2F%3F%23/variables",
    body: { name: "GREETING", value: "hello\n世界" },
    send: (transport: Client, body: unknown) => ProductApi.postApiOrgsOrgVariables(transport, { path: org, body })
  },
  {
    name: "repository update",
    method: "PATCH",
    path: base,
    body: { description: "", private: false },
    send: (transport: Client, body: unknown) => ProductApi.patchApiReposOwnerRepo(transport, { path: repo, body })
  },
  {
    name: "comment edit",
    method: "PATCH",
    path: `${base}/issues/comments/comment%2F7`,
    body: { body: "replacement\n世界" },
    send: (transport: Client, body: unknown) =>
      ProductApi.patchApiReposOwnerRepoIssuesCommentsId(transport, { path: { ...repo, id: "comment/7" }, body })
  },
  {
    name: "wiki edit",
    method: "PATCH",
    path: `${base}/wiki/page%2F7`,
    body: { title: "Renamed", body: "", expected_revision: 7 },
    send: (transport: Client, body: unknown) =>
      ProductApi.patchApiReposOwnerRepoWikiSlug(transport, { path: { ...repo, slug: "page/7" }, body })
  },
  {
    name: "action-cache write",
    method: "PUT",
    path: `${base}/build-cache/ac/key%2F7`,
    body: { exit_code: 0, outputs: [{ path: "out.txt", digest: "abc", size: 0 }] },
    send: (transport: Client, body: unknown) =>
      ProductApi.putApiReposOwnerRepoBuildCacheAcKeydigest(transport, { path: { ...repo, keyDigest: "key/7" }, body })
  },
  {
    name: "agent-session message",
    method: "POST",
    path: `${base}/agent/sessions/session%2F7/messages`,
    body: { role: "user", content: "hello\n世界" },
    send: (transport: Client, body: unknown) =>
      ProductApi.postApiReposOwnerRepoAgentSessionsIdMessages(transport, { path: { ...repo, id: "session/7" }, body })
  },
  {
    name: "issue creation",
    method: "POST",
    path: `${base}/issues`,
    body: { title: "A title", body: "Details\n世界" },
    send: (transport: Client, body: unknown) => ProductApi.postApiReposOwnerRepoIssues(transport, { path: repo, body })
  },
  {
    name: "issue update",
    method: "PATCH",
    path: `${base}/issues/7`,
    body: { title: "Renamed", body: "", state: "closed", labels: [] },
    send: (transport: Client, body: unknown) =>
      ProductApi.patchApiReposOwnerRepoIssuesNumber(transport, { path: { ...repo, number: "7" }, body })
  },
  {
    name: "issue-comment creation",
    method: "POST",
    path: `${base}/issues/7/comments`,
    body: { body: "A comment\n世界" },
    send: (transport: Client, body: unknown) =>
      ProductApi.postApiReposOwnerRepoIssuesNumberComments(transport, { path: { ...repo, number: "7" }, body })
  }
] as const

describe("product API mutation request bodies", () => {
  for (const mutation of mutations) {
    it.effect(`${mutation.name} transmits its JSON fields`, () =>
      Effect.gen(function*() {
        const { transport } = yield* client
        const result = yield* Effect.tryPromise(() => mutation.send(transport, mutation.body))
        expect(result).toEqual({
          method: mutation.method,
          path: mutation.path,
          contentType: "application/json",
          body: mutation.body
        })
      }).pipe(Effect.scoped))
  }

  for (const rawBody of ["{ \"signed\": \"世界\" }\n", ""]) {
    it.effect(`raw signed JSON takes precedence over binary input (${rawBody.length} characters)`, () =>
      Effect.gen(function*() {
        const { transport } = yield* client
        const result = yield* Effect.tryPromise(() =>
          transport.request("POST", "/webhooks/github", new Uint8Array([0, 255]), { rawBody })
        )
        expect(result).toEqual({
          method: "POST",
          path: "/webhooks/github",
          contentType: "application/json",
          body: rawBody === "" ? "" : JSON.parse(rawBody)
        })
      }).pipe(Effect.scoped))
  }

  for (
    const [name, body] of [
      ["all byte values", Uint8Array.from({ length: 256 }, (_, index) => index)],
      ["empty bytes", new Uint8Array()],
      ["a byte view", new Uint8Array([9, 0, 255, 128, 10, 9]).subarray(1, 5)]
    ] as const
  ) {
    it.effect(`content-addressed cache upload preserves ${name}`, () =>
      Effect.gen(function*() {
        const { transport } = yield* client
        const result = yield* Effect.tryPromise(() =>
          ProductApi.putApiReposOwnerRepoBuildCacheCasDigest(transport, {
            path: { ...repo, digest: "digest/7" },
            body
          })
        )
        expect(result).toEqual({
          method: "PUT",
          path: `${base}/build-cache/cas/digest%2F7`,
          contentType: "application/octet-stream",
          body: Array.from(body)
        })
      }).pipe(Effect.scoped))
  }
})
