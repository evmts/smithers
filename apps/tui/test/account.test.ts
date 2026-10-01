/** Adapter protocol tests use actual loopback HTTP and the production selected-session reader.
 * Controlled HTTP verdicts cover refusal/corruption; real Go/PostgreSQL acceptance is separate.
 */
import * as CloudSession from "@smthrs/cli/CloudSession"
import { expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Account from "../src/account.ts"
import * as Session from "../src/session.ts"

const waitFor = async (condition: () => boolean) => {
  const deadline = Date.now() + 2000
  while (!condition() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 2))
  expect(condition()).toBe(true)
}
const deferred = <A>() => {
  let resolve!: (value: A) => void
  const promise = new Promise<A>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

it("shows signed out without writing an account receipt or attempting a backend read", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-account-signed-out-"))
  const receipts: Account.Receipt[] = []
  let presented = 0
  const controller = Account.controller({
    session: () => CloudSession.signedIn({ HOME: root, SMITHERS_DISABLE_SYSTEM_KEYRING: "1" }),
    persist: (receipt) => {
      receipts.push(receipt)
    },
    present: () => {
      presented++
    }
  })
  try {
    expect(await controller.show()).toEqual({ value: "signed out: the sign-in step is in the chat" })
    expect(controller.state()).toEqual({ phase: "signed-out" })
    expect(Account.panel(controller.state()).rows.map((row) => row.label)).toEqual(["smthrs auth login"])
    expect(receipts).toEqual([])
    expect(presented).toBe(1)
  } finally {
    controller.dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

it("persists only request identity before a held read, shares actors, and refetches facts after reload", async () => {
  const root = mkdtempSync(join(tmpdir(), "tui-account-history-"))
  const gate = deferred<void>()
  let username = "first-account-owner"
  let reads = 0
  const order: string[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      expect(new URL(request.url).pathname).toBe("/api/user")
      expect(request.headers.get("authorization")).toBe("token owned-account-token")
      reads++
      order.push("read")
      await gate.promise
      return Response.json({ username, token: "private-response-value", scopes: ["invented"] })
    }
  })
  const env = {
    HOME: root,
    SMITHERS_DISABLE_SYSTEM_KEYRING: "1",
    SMITHERS_API_ORIGIN: server.url.origin,
    SMITHERS_TOKEN: "owned-account-token"
  }
  const writer = Session.create(root, "chat", { file: join(root, "history.jsonl") })
  const make = () =>
    Account.controller({
      session: () => CloudSession.signedIn(env),
      persist: (receipt, at) => {
        order.push("persist:" + receipt.state)
        writer.append({ type: "account", at, receipt })
      },
      present: () => {}
    })
  const controller = make()
  let restored: ReturnType<typeof make> | undefined
  try {
    expect(await controller.show({}, "user")).toEqual({ value: "Requested" })
    expect(await controller.show({}, "agent")).toEqual({ value: "Requested" })
    await waitFor(() => reads === 1)
    expect(order[0]).toBe("persist:requested")
    expect(controller.state().phase).toBe("requested")
    const pending = Session.restore(Session.load(writer.file)).account
    expect(pending?.actor).toBe("user")
    expect(pending?.state).toBe("requested")
    expect(reads).toBe(1)
    gate.resolve(undefined)
    await waitFor(() => controller.state().phase === "complete")
    expect(controller.state()).toEqual({ phase: "complete", facts: { login: username, scopes: [], boxes: [] } })
    const history = readFileSync(writer.file, "utf8")
    for (const privateValue of [username, env.SMITHERS_TOKEN, "private-response-value", "invented"]) {
      expect(history).not.toContain(privateValue)
    }
    const receipt = Session.restore(Session.load(writer.file)).account
    expect(receipt?.state).toBe("complete")
    controller.dispose()
    username = "fresh-read-owner"
    restored = make()
    restored.restore(receipt)
    await waitFor(() => restored?.state().phase === "complete")
    expect(reads).toBe(2)
    expect(restored.state()).toEqual({ phase: "complete", facts: { login: username, scopes: [], boxes: [] } })
    expect(Session.restore(Session.load(writer.file)).account?.id).not.toBe(receipt?.id)
  } finally {
    gate.resolve(undefined)
    controller.dispose()
    restored?.dispose()
    try {
      await server.stop(true)
    } finally {
      rmSync(Session.directory(root), { recursive: true, force: true })
      rmSync(root, { recursive: true, force: true })
    }
  }
})

for (const mode of ["revoked", "malformed"] as const) {
  it(`keeps ${mode} response details private and retries through a new selected request`, async () => {
    const root = mkdtempSync(join(tmpdir(), "tui-account-refusal-"))
    let refuse = true
    let reads = 0
    const receipts: Account.Receipt[] = []
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        reads++
        return refuse
          ? Response.json({ message: "private-server-marker" }, { status: mode === "revoked" ? 401 : 200 })
          : Response.json({ username: "current-owner" })
      }
    })
    const controller = Account.controller({
      session: () =>
        CloudSession.signedIn({
          HOME: root,
          SMITHERS_DISABLE_SYSTEM_KEYRING: "1",
          SMITHERS_API_ORIGIN: server.url.origin,
          SMITHERS_TOKEN: "owned-token"
        }),
      persist: (receipt) => {
        receipts.push(receipt)
      },
      present: () => {}
    })
    try {
      await controller.show()
      await waitFor(() => controller.state().phase === "failed")
      expect(JSON.stringify(controller.state())).not.toContain("private-server-marker")
      expect(JSON.stringify(Account.panel(controller.state()))).not.toContain("private-server-marker")
      expect(receipts.map((receipt) => receipt.state)).toEqual(["requested", "failed"])
      const previous = receipts[0]!.id
      refuse = false
      await controller.show()
      await waitFor(() => controller.state().phase === "complete")
      expect(receipts[2]!.id).not.toBe(previous)
      expect(reads).toBe(2)
      expect(controller.state()).toEqual({
        phase: "complete",
        facts: { login: "current-owner", scopes: [], boxes: [] }
      })
    } finally {
      controller.dispose()
      try {
        await server.stop(true)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  })
}

for (const change of ["credential", "origin", "logout ABA", "session switch", "dispose"] as const) {
  it(`never republishes a held old account after ${change}`, async () => {
    const root = mkdtempSync(join(tmpdir(), "tui-account-stale-"))
    const release = deferred<void>()
    let oldReads = 0
    let newReads = 0
    const oldServer = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch() {
        oldReads++
        if (oldReads === 1) {
          await release.promise
          return Response.json({ username: "private-old-account" })
        }
        return Response.json({ username: "current-owner" })
      }
    })
    const newServer = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        newReads++
        return Response.json({ username: "current-owner" })
      }
    })
    const env: Record<string, string | undefined> = {
      HOME: root,
      SMITHERS_DISABLE_SYSTEM_KEYRING: "1",
      SMITHERS_API_ORIGIN: oldServer.url.origin,
      SMITHERS_TOKEN: "owned-old-token"
    }
    const receipts: Account.Receipt[] = []
    const controller = Account.controller({
      session: () => CloudSession.signedIn(env),
      persist: (receipt) => {
        receipts.push(receipt)
      },
      present: () => {}
    })
    try {
      await controller.show()
      await waitFor(() => oldReads === 1)
      if (change === "credential") env.SMITHERS_TOKEN = "owned-new-token"
      if (change === "origin") env.SMITHERS_API_ORIGIN = newServer.url.origin
      if (change === "logout ABA") {
        env.SMITHERS_TOKEN = undefined
        await controller.show()
        expect(controller.state().phase).toBe("signed-out")
        env.SMITHERS_TOKEN = "owned-old-token"
      }
      if (change === "session switch") controller.restore(undefined)
      if (change === "dispose") controller.dispose()
      else {
        await controller.show({}, "agent")
        await waitFor(() => controller.state().phase === "complete")
      }
      release.resolve(undefined)
      await new Promise((resolve) => setImmediate(resolve))
      await new Promise((resolve) => setImmediate(resolve))
      expect(JSON.stringify(controller.state())).not.toContain("private-old-account")
      if (change === "dispose") {
        expect(controller.state()).toEqual({ phase: "idle" })
        expect(oldReads).toBe(1)
      } else {expect(controller.state()).toEqual({
          phase: "complete",
          facts: { login: "current-owner", scopes: [], boxes: [] }
        })}
      if (change === "origin") {
        expect(newReads).toBe(1)
        expect(oldReads).toBe(1)
      }
      for (const value of ["private-old-account", "owned-old-token", "owned-new-token", "current-owner"]) {
        expect(JSON.stringify(receipts)).not.toContain(value)
      }
    } finally {
      release.resolve(undefined)
      controller.dispose()
      try {
        await oldServer.stop(true)
      } finally {
        try {
          await newServer.stop(true)
        } finally {
          rmSync(root, { recursive: true, force: true })
        }
      }
    }
  })
}

it("projects restored request receipts to canonical keys before they can be persisted again", () => {
  const canonical: Account.Receipt = {
    actor: "user",
    id: "retained-account-request",
    owner: "a".repeat(64),
    origin: "http://127.0.0.1:32101",
    state: "requested"
  }
  const supplied = { ...canonical, token: "private-retained-token", facts: { login: "private-retained-owner" } }
  const restored = Session.restore([{ type: "account", at: 1, receipt: supplied }]).account
  expect(restored).toEqual(canonical)
  expect(Account.receiptOf(supplied)).toEqual(canonical)
  expect(supplied.token).toBe("private-retained-token")
})
