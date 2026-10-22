import { NodeServices } from "@effect/platform-node"
import * as CloudSandbox from "@smthrs/cli/CloudSandbox"
import { Deferred, Effect, Fiber } from "effect"
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner"
import { TestClock } from "effect/testing"
import { mkdtempSync, rmSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"

it.each(["acquire", "attach"] as const)(
  "renews sticky leases throughout %s and stops when the scope closes",
  async (mode) => {
    const workdir = mkdtempSync(join(tmpdir(), "sticky-lease-"))
    let renewals = 0
    let deletes = 0
    const server = createServer((request, response) => {
      if (request.url?.endsWith("/lease")) renewals++
      if (request.method === "DELETE") deletes++
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ id: "ws-sticky", status: "running" }))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      await Effect.runPromise(
        Effect.gen(function*() {
          const spawner = yield* ChildProcessSpawner
          const api = CloudSandbox.workspaceApi({
            SMITHERS_API_ORIGIN: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
            SMITHERS_TOKEN: "test-user-token"
          })
          // Use the real local command host and real HTTP control transport.
          const localApi = { request: api.request, sshPrefix: async () => [] }
          const provider = CloudSandbox.make({
            spawner,
            repository: "acme/repo",
            api: localApi,
            workdir,
            persistence: "sticky",
            clientLeaseSeconds: 60
          })
          const ready = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          const work = yield* Effect.forkChild(Effect.scoped(Effect.gen(function*() {
            yield* mode === "acquire"
              ? provider.acquire("long-work")
              : provider.attach!({ id: "long-work", remoteId: "ws-sticky" })
            yield* Deferred.succeed(ready, undefined)
            yield* Deferred.await(release)
          })))
          yield* Deferred.await(ready)
          expect(renewals).toBe(1)
          yield* TestClock.adjust("20 seconds")
          yield* Effect.promise(() => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/barrier`))
          expect(renewals).toBe(2)
          yield* TestClock.adjust("20 seconds")
          yield* Effect.promise(() => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/barrier`))
          expect(renewals).toBe(3)
          yield* Deferred.succeed(release, undefined)
          yield* Fiber.join(work)
          yield* TestClock.adjust("60 seconds")
          expect(renewals).toBe(3)
          expect(deletes).toBe(0)
        }).pipe(Effect.provide(TestClock.layer()), Effect.provide(NodeServices.layer))
      )
    } finally {
      rmSync(workdir, { recursive: true, force: true })
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
)
