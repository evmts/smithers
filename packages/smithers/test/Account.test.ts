/** Controlled loopback protocol tests of the real CLI Client/Session binding.
 * They do not substitute for public CLI acceptance against owned Go/PostgreSQL.
 */
import * as Account from "@smthrs/control/Account"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { declarations, handlers } from "../src/internal/backend/Account.ts"
import { APIError, Client } from "../src/internal/backend/Client.ts"

const execute = (client: Client) => handlers["account show"]!(client, {}, {})
const deferred = <A>() => {
  let resolve!: (value: A) => void
  const promise = new Promise<A>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

it("uses the shared declaration for the existing CLI command and preserves its empty input declaration", () => {
  expect(Object.keys(declarations)).toEqual([Account.accountOperations[0].name.replaceAll(".", " ")])
  expect(declarations["account show"]!.description).toBe(Account.accountOperations[0].summary)
  expect(declarations["account show"]!.args.parse({})).toEqual({})
})

describe("CLI selected Account", () => {
  it("retains a reconnect identity before unresolved admission and returns its real receipt", async () => {
    const root = mkdtempSync(join(tmpdir(), "cli-account-"))
    const entered = deferred<void>()
    const release = deferred<void>()
    let requests = 0
    let requestId = ""
    const server = createServer(async (request, response) => {
      expect(request.method).toBe("POST")
      expect(request.url).toBe("/api/workflow/rpc")
      expect(request.headers.authorization).toBe("token owned-token")
      requests++
      let raw = ""
      for await (const chunk of request) raw += chunk
      const invocation = JSON.parse(raw)
      expect(invocation).toEqual({
        procedure: "Operation.Dispatch",
        payload: { name: "account.show", requestId: expect.any(String), input: {} }
      })
      requestId = invocation.payload.requestId
      entered.resolve(undefined)
      await release.promise
      response.setHeader("content-type", "application/json")
      response.end(
        JSON.stringify({
          operationId: "operation-1",
          requestId,
          kind: "requested",
          state: "accepted",
          acceptedAt: "2026-10-01T00:00:00Z"
        })
      )
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const client = new Client({
      environment: {
        HOME: root,
        SMITHERS_DISABLE_SYSTEM_KEYRING: "1",
        SMITHERS_API_ORIGIN: origin,
        SMITHERS_TOKEN: "owned-token"
      }
    })
    let settled = false
    const result = execute(client).then((value) => {
      settled = true
      return value
    })
    try {
      await entered.promise
      expect(settled).toBe(false)
      expect(requests).toBe(1)
      const retained = readdirSync(root, { recursive: true }).filter((path) =>
        typeof path === "string" && path.endsWith(".json")
      )
      expect(retained).toHaveLength(1)
      const pending = readFileSync(join(root, String(retained[0])), "utf8")
      expect(JSON.parse(pending)).toEqual({ requestId })
      expect(pending).not.toContain("owned-token")
      release.resolve(undefined)
      expect(await result).toEqual({
        operationId: "operation-1",
        requestId,
        kind: "requested",
        state: "accepted",
        acceptedAt: "2026-10-01T00:00:00Z"
      })
      expect(requests).toBe(1)
    } finally {
      release.resolve(undefined)
      await Promise.allSettled([result])
      server.closeAllConnections()
      try {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })

  for (const verdict of ["revoked", "malformed", "changed credential", "changed origin"] as const) {
    it(`refuses ${verdict} without returning unverified or private account facts`, async () => {
      const root = mkdtempSync(join(tmpdir(), "cli-account-refusal-"))
      const entered = deferred<void>()
      const release = deferred<void>()
      const server = createServer(async (_request, response) => {
        entered.resolve(undefined)
        await release.promise
        response.statusCode = verdict === "revoked" ? 401 : 200
        response.setHeader("content-type", "application/json")
        response.end(
          JSON.stringify(
            verdict === "malformed" ? { message: "private-server-marker" } : { username: "private-old-owner" }
          )
        )
      })
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
      const env: Record<string, string | undefined> = {
        HOME: root,
        SMITHERS_DISABLE_SYSTEM_KEYRING: "1",
        SMITHERS_API_ORIGIN: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        SMITHERS_TOKEN: "owned-token"
      }
      const result = execute(new Client({ environment: env }))
      // Observe rejection immediately while the HTTP verdict is deliberately unresolved.
      const observed = result.then((value) => ({ value }), (error) => ({ error }))
      try {
        await entered.promise
        if (verdict === "changed credential") env.SMITHERS_TOKEN = "replacement-token"
        if (verdict === "changed origin") env.SMITHERS_API_ORIGIN = "http://127.0.0.1:32199"
        release.resolve(undefined)
        const outcome = await observed
        expect("error" in outcome).toBe(true)
        if ("error" in outcome) {
          if (verdict === "revoked") {
            expect(outcome.error).toBeInstanceOf(APIError)
            expect(outcome.error).toMatchObject({ status: 401 })
          } else {expect(outcome.error).toMatchObject({
              code: verdict === "malformed" ? "backend_protocol" : "account_changed"
            })}
          expect(String(outcome.error)).not.toContain("private-server-marker")
          expect(String(outcome.error)).not.toContain("private-old-owner")
        }
      } finally {
        release.resolve(undefined)
        await observed
        server.closeAllConnections()
        try {
          await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
        } finally {
          rmSync(root, { recursive: true, force: true })
        }
      }
    })
  }
})

describe("CLI Account reconnect protocol", () => {
  for (
    const terminal of [
      { operationId: "operation-1", requestId: "request-1", actor: "api", state: "completed" },
      {
        operationId: "operation-1",
        requestId: "request-1",
        actor: "api",
        state: "accepted",
        result: { login: "private-old-owner" }
      },
      {
        operationId: "operation-1",
        requestId: "request-1",
        actor: "api",
        state: "completed",
        result: { login: "owner", email: "private-email" }
      },
      {
        operationId: "operation-1",
        requestId: "another-request",
        actor: "api",
        state: "completed",
        result: { login: "private-old-owner" }
      },
      { operationId: "operation-1", requestId: "request-1", actor: "agent", state: "failed" }
    ]
  ) {
    it(`refuses an invalid or stale terminal projection: ${JSON.stringify(terminal)}`, async () => {
      const root = mkdtempSync(join(tmpdir(), "cli-account-reconnect-"))
      const server = createServer(async (request, response) => {
        let raw = ""
        for await (const chunk of request) raw += chunk
        expect(JSON.parse(raw)).toEqual({
          procedure: "Operation.Read",
          payload: { name: "account.show", requestId: "request-1" }
        })
        expect(request.url).toBe("/api/workflow/rpc")
        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify(terminal))
      })
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
      const client = new Client({
        environment: {
          HOME: root,
          SMITHERS_DISABLE_SYSTEM_KEYRING: "1",
          SMITHERS_API_ORIGIN: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
          SMITHERS_TOKEN: "owned-token"
        }
      })
      try {
        await expect(handlers["account show"]!(client, {}, { request: "request-1" })).rejects.toMatchObject({
          code: "backend_protocol"
        })
      } finally {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
        rmSync(root, { recursive: true, force: true })
      }
    })
  }
  for (const options of [{ history: true, request: "request-1" }, { history: true, cancel: true }, { cancel: true }]) {
    it(`refuses incompatible reconnect options before transport: ${JSON.stringify(options)}`, async () => {
      const client = new Client({ environment: { HOME: tmpdir(), SMITHERS_DISABLE_SYSTEM_KEYRING: "1" } })
      await expect(handlers["account show"]!(client, {}, options)).rejects.toMatchObject({ _tag: "/cli/UsageError" })
    })
  }
})
