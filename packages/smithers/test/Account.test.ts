/** Controlled loopback protocol tests of the real CLI Client/Session binding.
 * They do not substitute for public CLI acceptance against owned Go/PostgreSQL.
 */
import * as Account from "@smthrs/control/Account"
import { mkdtempSync, rmSync } from "node:fs"
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
  it("awaits its selected authenticated read and returns only independently projected account facts", async () => {
    const root = mkdtempSync(join(tmpdir(), "cli-account-"))
    const entered = deferred<void>()
    const release = deferred<void>()
    let requests = 0
    const server = createServer(async (request, response) => {
      expect(request.method).toBe("GET")
      expect(request.url).toBe("/api/user")
      expect(request.headers.authorization).toBe("token owned-token")
      requests++
      entered.resolve(undefined)
      await release.promise
      response.setHeader("content-type", "application/json")
      response.end(
        JSON.stringify({
          username: "selected-owner",
          token: "private-server-token",
          scopes: ["invented"],
          email: "private-email"
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
      release.resolve(undefined)
      expect(await result).toEqual({ login: "selected-owner" })
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
              code: verdict === "malformed" ? "backend_protocol" : "session_expired"
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
