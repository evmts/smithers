import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { admin } from "../src/internal/backend/Admin.ts"
import { Client, esc, type Values } from "../src/internal/backend/Client.ts"
import * as ProductApi from "../src/internal/backend/ProductApi.ts"
import { stacks } from "../src/internal/backend/Stack.ts"

// Fault injection is a provided Effect service at a real HTTP server boundary;
// fetch, Client, streaming, and the filesystem all run unchanged.
type Endpoint = (request: IncomingMessage, response: ServerResponse) => Promise<void>
class FaultEndpoint extends Context.Service<FaultEndpoint, Endpoint>()("test/backend/FaultEndpoint") {}
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})
const serve = async (endpoint: Endpoint) => {
  const home = await mkdtemp(join(tmpdir(), "smithers-backend-safety-"))
  cleanup.push(() => rm(home, { recursive: true, force: true }))
  const server = createServer((request, response) => {
    void Effect.runPromise(
      Effect.gen(function*() {
        const handle = yield* FaultEndpoint
        yield* Effect.tryPromise(() => handle(request, response))
      }).pipe(Effect.provideService(FaultEndpoint, endpoint))
    ).catch(() => response.destroy())
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  cleanup.push(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Missing HTTP address")
  const origin = `http://127.0.0.1:${address.port}`
  const environment = {
    HOME: home,
    SMITHERS_API_ORIGIN: origin,
    SMITHERS_TOKEN: "test-session",
    SMITHERS_DISABLE_SYSTEM_KEYRING: "1"
  }
  return { home, environment, origin, client: new Client({ environment }) }
}
const json = (response: ServerResponse, value: unknown, status = 200) => {
  response.writeHead(status, { "content-type": "application/json" })
  response.end(JSON.stringify(value))
}

describe("export filesystem safety", () => {
  it("does not follow or delete a pre-existing predictable staging symlink", async () => {
    const { home, client } = await serve(async (_request, response) => {
      response.end("archive")
    })
    const out = join(home, "export.gz"), victim = join(home, "victim")
    await writeFile(victim, "keep")
    await symlink(victim, `${out}.partial`)
    await admin["admin user export"]!(client, { username: "alice", out }, {})
    expect(await readFile(victim, "utf8")).toBe("keep")
    expect(await readFile(out, "utf8")).toBe("archive")
    expect((await readdir(home)).sort()).toEqual(["export.gz", "export.gz.partial", "victim"])
  })

  it("publishes an owner-only archive even when replacing a readable file", async () => {
    const { home, client } = await serve(async (_request, response) => {
      response.end("private archive")
    })
    const out = join(home, "export.gz")
    await writeFile(out, "old", { mode: 0o644 })
    await admin["admin user export"]!(client, { username: "alice", out }, {})
    expect((await stat(out)).mode & 0o777).toBe(0o600)
    expect(await readFile(out, "utf8")).toBe("private archive")
  })

  it("isolates concurrent exports until each archive is atomically published", async () => {
    const gate = Promise.withResolvers<void>()
    let requests = 0
    const { home, client } = await serve(async (_request, response) => {
      if (++requests === 1) {
        response.write("first-")
        await gate.promise
        response.end("end")
      } else response.end("second")
    })
    const out = join(home, "export.gz")
    const first = admin["admin user export"]!(client, { username: "alice", out }, {})
      .then((value) => ({ value }), (error: unknown) => ({ error }))
    try {
      await expect.poll(async () => (await readdir(home)).some((name) => name.startsWith("export.gz.partial")))
        .toBe(true)
      await admin["admin user export"]!(client, { username: "alice", out }, {})
      expect(await readFile(out, "utf8")).toBe("second")
    } finally {
      gate.resolve()
    }
    expect(await first).toMatchObject({ value: { bytes: 9 } })
    expect(await readFile(out, "utf8")).toBe("first-end")
    expect(await readdir(home)).toEqual(["export.gz"])
  })

  it("keeps in-flight data private and cleans it up after a dropped connection", async () => {
    const gate = Promise.withResolvers<void>()
    const { home, client } = await serve(async (_request, response) => {
      response.write("unfinished")
      await gate.promise
      response.destroy()
    })
    const out = join(home, "export.gz")
    await writeFile(out, "previous archive")
    const running = admin["admin user export"]!(client, { username: "alice", out }, {})
      .then(() => "unexpected success", () => "failed")
    try {
      await expect.poll(async () => {
        const directory = (await readdir(home)).find((name) => name.startsWith("export.gz.partial-"))
        if (!directory) return false
        const staging = join(home, directory)
        const archive = (await readdir(staging))[0]
        if (!archive) return false
        return [(await stat(staging)).mode & 0o777, (await stat(join(staging, archive))).mode & 0o777]
      }).toEqual([0o700, 0o600])
    } finally {
      gate.resolve()
    }
    expect(await running).toBe("failed")
    expect(await readFile(out, "utf8")).toBe("previous archive")
    expect(await readdir(home)).toEqual(["export.gz"])
  })
})

const landing = async (fault: {
  readonly dismissed?: boolean
  readonly later?: "checks" | "reviews"
  readonly direct?: boolean
  readonly fallback?: boolean
  readonly checkFault?: "missing" | "short" | "limit" | "emptyLast"
}) => {
  const merges: Array<Values> = [], pages: Array<string> = []
  const fixture = await serve(async (request, response) => {
    let path = request.url!, body: Values = {}
    if (request.method === "POST") {
      let text = ""
      for await (const chunk of request) text += chunk
      body = JSON.parse(text) as Values
    }
    if (path.includes("/stacks/active")) {
      json(response, { id: "stack", changes: [{ change_id: "abc123", pr_number: 1 }] })
      return
    }
    if (path.endsWith("/github-proxy")) {
      path = String(body.path)
      body = body.body as Values ?? {}
    } else if (request.method === "PUT") {
      let text = ""
      for await (const chunk of request) text += chunk
      body = JSON.parse(text) as Values
    }
    const url = new URL(path, "http://github.local")
    if (url.pathname.endsWith("/merge")) {
      merges.push(body)
      // Simulate a head advancing after inspection: GitHub refuses the checked
      // SHA, while a request without that precondition could merge the new head.
      json(response, { message: "Head changed" }, fault.fallback && body.merge_method !== "rebase" ? 405 : 409)
    } else if (url.pathname.endsWith("/check-runs")) {
      pages.push(path)
      if (fault.checkFault === "missing") {
        json(response, {})
        return
      }
      const later = fault.later === "checks"
      const runs = later && url.searchParams.get("page") === "2"
        ? [{ name: "late failure", status: "completed", conclusion: "failure" }]
        : fault.checkFault === "emptyLast" && url.searchParams.get("page") === "2"
        ? []
        : Array.from({ length: later || ["limit", "emptyLast"].includes(fault.checkFault ?? "") ? 100 : 1 }, () => ({
          name: "CI",
          status: "completed",
          conclusion: "success"
        }))
      const total = fault.checkFault === "short"
        ? 2
        : fault.checkFault === "emptyLast"
        ? 100
        : later
        ? 101
        : runs.length
      json(response, { total_count: total, check_runs: runs })
    } else if (url.pathname.endsWith("/reviews")) {
      pages.push(path)
      const approval = { user: { login: "alice" }, state: "APPROVED" }
      json(
        response,
        fault.dismissed
          ? [approval, { user: { login: "ALICE" }, state: "DISMISSED" }]
          : fault.later === "reviews"
          ? url.searchParams.get("page") === "2"
            ? [{ user: { login: "bob" }, state: "CHANGES_REQUESTED" }]
            : Array.from({ length: 100 }, () => approval)
          : [approval]
      )
    } else json(response, { state: "open", head: { sha: "checked-head" }, mergeable: true })
  })
  const client = fault.direct ?
    new Client({
      environment: {
        ...fixture.environment,
        GITHUB_TOKEN: "test-github-token",
        SMITHERS_GITHUB_API_URL: fixture.origin
      }
    }) :
    fixture.client
  return { client, merges, pages }
}

describe("landing evidence over HTTP", () => {
  it.each([false, true])("pins every merge method to the inspected head (direct=%s)", async (direct) => {
    const f = await landing({ direct, fallback: true })
    await expect(stacks["stack land"]!(f.client, {}, { repo: "owner/repo" })).rejects.toThrow("409")
    expect(f.merges).toEqual(
      ["merge", "squash", "rebase"].map((merge_method) => ({ merge_method, sha: "checked-head" }))
    )
  })

  it("revokes an earlier approval after dismissal", async () => {
    const f = await landing({ dismissed: true })
    await expect(stacks["stack land"]!(f.client, {}, { repo: "owner/repo" })).rejects.toThrow("review is not approved")
    expect(f.merges).toEqual([])
  })

  it.each(["checks", "reviews"] as const)("reads blocking %s beyond page one", async (later) => {
    const f = await landing({ later })
    await expect(stacks["stack land"]!(f.client, {}, { repo: "owner/repo" })).rejects.toThrow(
      later === "checks" ? "CI is failing" : "review is not approved"
    )
    expect(f.pages.some((path) => path.includes("page=2"))).toBe(true)
    expect(f.merges).toEqual([])
  })

  it.each(["missing", "short", "limit"] as const)("refuses incomplete evidence (%s)", async (checkFault) => {
    const f = await landing({ checkFault })
    await expect(stacks["stack land"]!(f.client, {}, { repo: "owner/repo" })).rejects.toMatchObject({
      code: "github_protocol"
    })
    expect(f.merges).toEqual([])
  })

  it("accepts complete evidence ending at an exact page boundary", async () => {
    const f = await landing({ checkFault: "emptyLast" })
    await expect(stacks["stack land"]!(f.client, {}, { repo: "owner/repo" })).rejects.toThrow("409")
    expect(f.merges).toEqual([{ merge_method: "merge", sha: "checked-head" }])
  })
})

describe("product request destinations", () => {
  it.each([".", ".."])("rejects dot segment %s in the command encoder", (value) => {
    expect(() => esc(value)).toThrow()
  })
  it.each([".", ".."])("rejects dot segment %s before either encoder can send HTTP", async (value) => {
    const received: Array<string> = []
    const { client } = await serve(async (request, response) => {
      received.push(request.url!)
      json(response, {})
    })
    await expect((async () => ProductApi.getApiConversation(client, { path: { b: value } }))()).rejects.toThrow()
    expect(() => esc(value)).toThrow()
    expect(received).toEqual([])
  })

  it.each([ProductApi.getApiAuthAuth0Callback, ProductApi.getApiAuthGithubCallback])(
    "forwards OAuth callback code and state to the server (%s)",
    async (callback) => {
      const { client } = await serve(async (request, response) => {
        const url = new URL(request.url!, "http://local")
        json(response, Object.fromEntries(url.searchParams))
      })
      const query = { code: "code +/&?", state: "state +/&?" }
      expect(await callback(client, { query })).toEqual(query)
      const error = { state: query.state, error: "access_denied", error_description: "Denied +/ ?" }
      expect(await callback(client, { query: error })).toEqual(error)
      expect(await callback(client)).toEqual({})
    }
  )
})
