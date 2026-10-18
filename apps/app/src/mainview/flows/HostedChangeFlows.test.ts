import { expect, test } from "bun:test"
import { createCommandRegistry } from "./Commands"
import { stubCommandActions } from "./StubCommandActions"
const harness = (gate: () => Promise<string | undefined> = async () => undefined) => {
  const starts: unknown[] = []
  const confirmations: unknown[] = []
  const actions = stubCommandActions({
    snapshot: () => ({
      surface: "chat",
      typing: false,
      hasConnectors: true,
      admin: false,
      signedOut: false,
      viewerRole: "member"
    }),
    hostedChangeGate: gate,
    askHostedChange: async (input) => {
      starts.push(input)
    },
    requestFlowConfirmation: (...args) => {
      confirmations.push(args)
    },
    traceFlow: () => {}
  })
  return { registry: createCommandRegistry(actions), starts, confirmations }
}
test("agent-originated change.ask without person confirmation starts nothing", async () => {
  const h = harness()
  const answer = await h.registry.submit({
    name: "change.ask",
    payload: { repo: "maya/tinyhttp", request: "add slugify" },
    actor: "agent"
  })
  expect(answer.status).toBe("executed")
  expect(h.starts).toEqual([])
  expect(h.confirmations).toHaveLength(1)
})
test("person typed /change request starts directly", async () => {
  const h = harness()
  const answer = await h.registry.run("change", "add slugify")
  expect(answer.status).toBe("executed")
  expect(h.confirmations).toEqual([])
  expect(h.starts).toEqual([{ request: "add slugify" }])
})

for (const refusal of ["Sign in to start an agent.", "Only people who can push to maya/tinyhttp can start an agent."])
  test(`all change doors keep the gate: ${refusal}`, async () => {
    const h = harness(async () => refusal)
    for (const submit of [
      () => h.registry.run("change"),
      () => h.registry.run("change", "add slugify"),
      () =>
        h.registry.submit({
          name: "change.ask",
          payload: { repo: "maya/tinyhttp", request: "add slugify" },
          actor: "agent"
        })
    ])
      expect(await submit()).toMatchObject({ status: "failed", error: refusal })
    expect(h.starts).toEqual([])
    expect(h.confirmations).toEqual([])
  })
