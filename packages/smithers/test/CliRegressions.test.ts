import * as ScriptedJudge from "@smthrs/agent/ScriptedJudge"
import * as Audience from "@smthrs/build-cli/Audience"
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { normalizeArguments } from "../src/cli/Arguments.ts"
import { agentArguments, legacyArguments } from "../src/cli/Compatibility.ts"
import * as Bridge from "../src/cli/ControlBridge.ts"
import * as Presentation from "../src/cli/Presentation.ts"

const directory = realpathSync(mkdtempSync(join(tmpdir(), "smithers-cli-regressions-")))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

describe("CLI argument boundaries", () => {
  it.each(["--root", "--root=/literal"])("keeps option value %s opaque", (value) => {
    expect(normalizeArguments(["targets", "--filter", value, "--root", directory]))
      .toEqual(["targets", "--filter", value, "--workspace", directory])
    expect(normalizeArguments(["--filter", value, "targets"]))
      .toEqual(["targets", "--filter", value])
  })
  it("does not route literal --resume through the deprecated CLI", () => {
    expect(legacyArguments(["run", "//:app", "--", "--resume"])).toBeUndefined()
    expect(legacyArguments(["run", "//:app", "--resume", "r"])).toBeDefined()
  })
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])("ignores inherited alias %s", (name) => {
    expect(agentArguments([name, "argument"])).toBeUndefined()
  })
})

it.each([{ root: directory }, { mcpConfig: "/untrusted/mcp.json" }])(
  "refuses MCP filesystem override %j",
  async (override) => {
    await Presentation.scope({ request: {} }, { environment: {} }, async () => {
      expect(() => Bridge.configuration({ quiet: true, ...override }, { environment: {} }))
        .toThrow(/is not accepted over MCP/)
    })
  }
)

it("does not prepare history for an already cancelled invocation", async () => {
  const root = mkdtempSync(join(directory, "cancelled-"))
  const controller = new AbortController()
  controller.abort(new Error("cancelled before invocation"))
  await expect(Bridge.invoke(["resume", "missing-run"], { root, quiet: true }, {
    environment: {},
    signal: controller.signal
  })).rejects.toMatchObject({ code: "interrupted" })
  expect(existsSync(join(root, ".flows"))).toBe(false)
})

it("does not publish an operator credential when host composition fails", async () => {
  const root = mkdtempSync(join(directory, "failed-host-"))
  const token = join(root, "operator.token")
  const controller = new AbortController()
  controller.abort(new Error("cancelled startup"))
  await expect(
    Bridge.host({ host: "127.0.0.1", port: 0, listen: false, credential: undefined, operatorTokenFile: token }, {
      root,
      quiet: true
    }, { environment: {}, signal: controller.signal })
  )
    .rejects.toBeDefined()
  expect(existsSync(token)).toBe(false)
})

it("leaves no published credential when the real gateway socket cannot bind", async () => {
  const root = mkdtempSync(join(directory, "occupied-host-"))
  const token = join(root, "operator.token")
  const occupied = createServer()
  await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve))
  const address = occupied.address()
  if (address === null || typeof address === "string") throw new Error("socket did not bind")
  try {
    await expect(Bridge.host(
      {
        host: "127.0.0.1",
        port: address.port,
        listen: false,
        credential: undefined,
        operatorTokenFile: token
      },
      { root, quiet: true },
      {
        environment: {},
        evaluator: ScriptedJudge.layer,
        signal: AbortSignal.timeout(20_000)
      }
    )).rejects.toMatchObject({ _tag: "@smthrs/gateway/GatewayError", code: "bind_failed" })
    expect(existsSync(token)).toBe(false)
  } finally {
    await new Promise<void>((resolve) => occupied.close(() => resolve()))
  }
})

it("publishes the private credential only after the real gateway is listening", async () => {
  const root = mkdtempSync(join(directory, "ready-host-"))
  const token = join(root, "operator.token")
  const reservation = createServer()
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve))
  const address = reservation.address()
  if (address === null || typeof address === "string") throw new Error("socket did not bind")
  await new Promise<void>((resolve) => reservation.close(() => resolve()))
  const controller = new AbortController()
  let announce: () => void = () => {}
  const announced = new Promise<void>((resolve) => {
    announce = resolve
  })
  const runtime = {
    environment: {},
    evaluator: ScriptedJudge.layer,
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
    presentation: Audience.resolve({ env: {}, audience: "human", stdout: false, stderr: false }),
    stderr: {
      isTTY: false,
      columns: 80,
      write: (text: string) => {
        if (text.includes("listening")) announce()
      }
    }
  }
  await Presentation.scope({}, runtime, async () => {
    const hosting = Bridge.host(
      {
        host: "127.0.0.1",
        port: address.port,
        listen: false,
        credential: undefined,
        operatorTokenFile: token
      },
      { root, quiet: false },
      runtime
    ).then(() => undefined, (cause: unknown) => cause)
    try {
      await Promise.race([
        announced,
        hosting.then((cause) => {
          throw cause
        })
      ])
      expect(existsSync(token)).toBe(true)
      const response = await fetch(`http://127.0.0.1:${address.port}/health`)
      expect(response.ok).toBe(true)
    } finally {
      controller.abort(new Error("readiness checked"))
      await hosting
    }
    expect(await hosting).toMatchObject({ code: "interrupted" })
  })
})
