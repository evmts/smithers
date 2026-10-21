// ChatApi's records as the e2e tests read them (e2e/logs.ts). The live case opens a real Cloudflare tail on the
// deployment E2E_PROD_URL names, with the account's CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, and skips without
// them; it makes one signed-out read, which writes nothing.
import { describe, expect, it } from "vitest"
import { CloudflareTail, recordOf } from "./logs"
import { NEEDS } from "./target"

describe("a tail's log message as a record", () => {
  it("is the structured logger's JSON line parsed, or the object logged; anything else is no record", () => {
    expect(recordOf('{"message":"github.webhook","level":"INFO","annotations":{"outcome":"applied"}}')).toEqual({
      message: "github.webhook",
      level: "INFO",
      annotations: { outcome: "applied" },
    })
    expect(recordOf({ message: "repo.clone" })).toEqual({ message: "repo.clone" })
    expect(recordOf("plain text")).toBeUndefined()
    expect(recordOf("[1,2]")).toBeUndefined()
    expect(recordOf("null")).toBeUndefined()
    expect(recordOf(42)).toBeUndefined()
  })
})

const deployment = process.env.E2E_PROD_URL ?? ""

/** Whether a deployment run here could open a tail: the `localLogs` need, as e2e/target.ts declares it. */
const canTail = NEEDS.localLogs.met({ target: "deployment", role: () => null, env: process.env })

describe.skipIf(deployment === "" || !canTail)("a Cloudflare tail on the deployment's ChatApi", () => {
  it("streams the record of a request made after it opened, and is deleted on close", { timeout: 120_000 }, async () => {
    const tail = await CloudflareTail.shared()
    try {
      // A signed-out read of the issues shape is refused, and ChatApi records it (`github.shape.items`, 401). A tail
      // can take a few seconds to start streaming, so the read repeats until its record arrives.
      await expect.poll(async () => {
        await fetch(new URL("/api/shapes/items?offset=-1", deployment))
        return tail.lines.filter((line) => line.record?.message === "github.shape.items").length
      }, { timeout: 90_000, interval: 3_000 }).toBeGreaterThan(0)
    } finally {
      await tail.close()
    }
    // Closed, the process's next tail is a new one.
    const next = await CloudflareTail.shared()
    expect(next).not.toBe(tail)
    await next.close()
  })
})
