import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { Effect, Layer } from "effect"
import { Transport, transportFrom } from "../src/Http"
import { PublicationRefusal, rollout, type RolloutReceipt } from "../../../.smithers/flows/rollout/runtime.ts"
import { checkBootstrapCompatibility } from "./bootstrapCompatibility"
import { BackendRequirementsFile, BackendRequirementsFileLive, backendRequirementsRefusal, checkBackendRequirements } from "./backendRequirements"

const required = "a".repeat(40), live = "b".repeat(40)
const declaration = [{ commit: required, reason: "Requires the write route", issue: "#4265" }]
const file = JSON.stringify(declaration)
const run = (content: string, liveSha: string | null = live, read: Parameters<typeof transportFrom>[0] = async () => Response.json({ status: "ahead" }), token?: string) =>
  Effect.runPromise(checkBackendRequirements(liveSha, token).pipe(Effect.provide(Layer.merge(
    Layer.succeed(BackendRequirementsFile, { read: Effect.succeed(content) }),
    Layer.succeed(Transport, transportFrom(read))
  ))))

test.each(["ahead", "identical"])("accepts %s and records the required and live commits", async status => {
  const calls: string[] = []
  const receipt = await run(file, status === "identical" ? required : live, async (url, init) => {
    calls.push(String(url))
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-token")
    expect(init?.redirect).toBe("manual")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    return Response.json({ status })
  }, "fixture-token")
  const expectedLive = status === "identical" ? required : live
  expect(calls).toEqual([`https://api.github.com/repos/smithersai/smithers/compare/${required}...${expectedLive}`])
  expect(receipt).toEqual({ liveSha: expectedLive, verdict: "satisfied", error: null,
    requirements: [{ ...declaration[0], liveSha: expectedLive, verdict: "satisfied" }] })
})

test.each(["behind", "diverged"])("refuses %s and names the requirement, reason, live SHA and fix", async status => {
  const receipt = await run(file, live, async (_url, init) => {
    expect(new Headers(init?.headers).has("authorization")).toBe(false)
    return Response.json({ status })
  })
  expect(receipt).toMatchObject({ verdict: "refused", error: null, requirements: [{ verdict: "unsatisfied" }] })
  const message = backendRequirementsRefusal(receipt)
  for (const text of [required, declaration[0]!.reason, live, "deploy the backend first"]) expect(message).toContain(text)
})

test("checks every requirement and cannot hide a failure behind a success", async () => {
  let calls = 0
  const receipt = await run(JSON.stringify([...declaration, { commit: "c".repeat(40), reason: "Second route", issue: "#4265" }]), live,
    async () => Response.json({ status: ++calls === 1 ? "behind" : "ahead" }))
  expect(calls).toBe(2)
  expect(receipt.verdict).toBe("refused")
  expect(receipt.requirements.map(row => row.verdict)).toEqual(["unsatisfied", "satisfied"])
})

test.each([null, "", "unknown", "8d95bc05", "G".repeat(40)])("unknown live SHA %j refuses without fetching, even for []", async liveSha => {
  for (const content of [file, "[]"]) {
    let calls = 0
    const receipt = await run(content, liveSha, async () => { calls++; throw new Error("must not fetch") })
    expect(receipt).toMatchObject({ liveSha: null, verdict: "refused", error: "unknown-live-sha" })
    expect(calls).toBe(0)
  }
})

test.each(["", "{", "null", "{}", "[null]", '[{"commit":"abc"}]',
  JSON.stringify([{ ...declaration[0], commit: "A".repeat(40) }]),
  JSON.stringify([{ ...declaration[0], reason: " " }]),
  JSON.stringify([{ ...declaration[0], issue: "4265" }]),
  JSON.stringify([{ ...declaration[0], extra: true }])])("malformed file %s refuses without fetching", async content => {
  let calls = 0
  const receipt = await run(content, live, async () => { calls++; throw new Error("must not fetch") })
  expect(receipt).toEqual({ liveSha: live, verdict: "refused", error: "invalid-file", requirements: [] })
  expect(calls).toBe(0)
})

test("unreadable declaration refuses without retaining the filesystem error", async () => {
  const receipt = await Effect.runPromise(checkBackendRequirements(live).pipe(Effect.provide(Layer.merge(
    Layer.succeed(BackendRequirementsFile, { read: Effect.fail(new Error("PRIVATE_FILE_DETAIL")) }),
    Layer.succeed(Transport, transportFrom(async () => { throw new Error("must not fetch") }))
  ))))
  expect(receipt).toMatchObject({ verdict: "refused", error: "invalid-file" })
  expect(JSON.stringify(receipt)).not.toContain("PRIVATE")
})

test("empty requirements array succeeds without API reads; committed declaration is valid", async () => {
  const never = async () => { throw new Error("must not fetch") }
  expect(await run("[]", live, never)).toEqual({ liveSha: live, verdict: "satisfied", error: null, requirements: [] })
  const receipt = await Effect.runPromise(checkBackendRequirements(live).pipe(Effect.provide(Layer.merge(
    BackendRequirementsFileLive, Layer.succeed(Transport, transportFrom(async () => Response.json({ status: "ahead" })))
  ))))
  expect(receipt.verdict).toBe("satisfied")
})

test("API HTTP, network, JSON and unknown status errors fail closed without response or token data", async () => {
  for (const read of [
    async () => new Response("PRIVATE_API_BODY", { status: 403 }),
    async () => new Response("PRIVATE_API_BODY", { status: 302, headers: { location: "https://elsewhere.example" } }),
    async () => { throw new Error("PRIVATE_NETWORK_DETAIL") },
    async () => new Response("PRIVATE_API_BODY"),
    async () => Response.json({ status: "unexpected", detail: "PRIVATE_API_BODY" }),
    async () => Response.json(null)
  ]) {
    const receipt = await run(file, live, read, "PRIVATE_TOKEN")
    expect(receipt).toMatchObject({ verdict: "refused", error: "compare-api", requirements: [{ verdict: "unverified" }] })
    expect(JSON.stringify(receipt)).not.toContain("PRIVATE")
    expect(backendRequirementsRefusal(receipt)).not.toContain("PRIVATE")
  }
})

test("rollout reuses one bootstrap read and refuses before publication or rollback", async () => {
  const requests: string[] = [], events: string[] = []
  const receipts: Array<RolloutReceipt & { backendRequirements: unknown }> = []
  let backendRequirements: unknown = null
  const receipt = await rollout({
    lastReceipt: async () => null, capture: async () => ({ version: "live", revision: "c".repeat(40) }),
    checks: ["health"], rollbackChecks: ["health"], check: async () => ({ status: "passed" }),
    beforePublish: async () => {
      const bootstrap = await checkBootstrapCompatibility("https://backend.example", async url => {
        requests.push(String(url))
        return Response.json({ apiVersion: 1, host: "cloud", version: "1", buildSha: live,
          capabilities: ["identity", "agent"], authFlow: "redirect", sandbox: null })
      })
      const checked = await run(file, bootstrap.backendBuildSha, async url => {
        requests.push(String(url)); return Response.json({ status: "behind" })
      })
      backendRequirements = checked
      if (checked.verdict === "refused") throw new PublicationRefusal("backend-requirements")
    },
    publish: async () => { events.push("publish"); return { version: "candidate", revision: required } },
    restore: async () => { events.push("rollback") },
    record: async row => { receipts.push(structuredClone({ ...row, backendRequirements })) }
  })
  expect(events).toEqual([])
  expect(requests).toEqual(["https://backend.example/api/bootstrap",
    `https://api.github.com/repos/smithersai/smithers/compare/${required}...${live}`])
  expect(receipt).toMatchObject({ status: "refused", candidate: null, failedChecks: ["backend-requirements"], rollback: "not-needed" })
  expect(receipts.at(-1)?.backendRequirements).toMatchObject({ liveSha: live, verdict: "refused", requirements: [{ commit: required, verdict: "unsatisfied" }] })
})

test("deploy runs the same gate for dry runs and before publish and persists both receipt sections", () => {
  const deploy = readFileSync(new URL("./deploy.ts", import.meta.url), "utf8")
  const beforePublish = deploy.slice(deploy.indexOf("beforePublish: async"), deploy.indexOf("publish: async"))
  expect(beforePublish).toContain("await checkBackend()")
  expect(beforePublish).toContain("throw new PublicationRefusal(backendRefusal)")
  expect(deploy).toContain("bootstrapCompatibility?.backendBuildSha ?? null, process.env.GITHUB_TOKEN")
  expect(deploy.match(/await checkBootstrapCompatibility\(/g)).toHaveLength(1)
  expect(deploy).toContain("if (dryRun) {\n  backendRefusal = await checkBackend()")
  expect(deploy).toContain("const evidence = { ...receipt, backendRequirements }")
  expect(deploy.slice(deploy.indexOf("const receipt ="))).toContain("backendRequirements,")
  expect(deploy).toContain("if (backendRefusal ||")
})
