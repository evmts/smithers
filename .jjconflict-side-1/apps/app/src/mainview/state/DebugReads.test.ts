import { describe, expect, test } from "bun:test"
import type { AgentPort } from "../runtime/AgentPort"
import { scopedControllers } from "./ControllerTestScope"
import { createAppStore } from "./AppStore"
import type { AppStore } from "./AppStore"
import { diagnosticVisible } from "./AppState"
import { memoryStorage, settled } from "./TestFixtures"

const createAppController = scopedControllers()

/*
 * The §26 debug reads answer the human who typed them.
 *
 * `{ value }` is the agent boundary's channel and never renders on its own, so
 * a read whose only answer is a value was a silent no-op in the transcript —
 * the flow ran, the payload was correct, and the admin saw nothing.
 */

const debugAgent = (): AgentPort => ({
  available: true,
  startTurn: async () => ({ status: "started" }),
  cancelTurn: async () => {},
  subscribe: () => () => {}
})

/** The only session the debug plugin registers for. */
const adminStore = async (): Promise<AppStore> => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  store.dispatch({
    type: "identity.session.loaded",
    actor: "system",
    state: "signed-in",
    login: "will",
    admin: true,
    scopesPlain: null
  })
  return store
}

const bodies = (store: AppStore): string[] => [...store.collections.messages.values()].map((message) => message.text)

describe("the debug reads render for the human", () => {
  test("/debug.backend answers the human", async () => {
    const store = await adminStore()
    const controller = createAppController(store, debugAgent(), {
      fetchImpl: async () => new Response("{}", { status: 200 })
    })
    const before = store.collections.messages.size
    controller.send("/debug.backend")
    await settled()
    await settled()
    expect(store.collections.messages.size).toBe(before + 1)
    expect(bodies(store).at(-1)).toContain("agent backend: http")
  })

  test.each([
    ["debug.snapshot", "App state snapshot"],
    ["debug.events", "Transition journal tail"],
    ["debug.net", "Network tap"]
  ])("/%s appends its payload to the transcript", async (flow, title) => {
    const store = await adminStore()
    const controller = createAppController(store, debugAgent(), {
      fetchImpl: async () => new Response("{}", { status: 200 })
    })
    const before = store.collections.messages.size
    controller.send(`/${flow}`)
    await settled()
    await settled()
    expect(store.collections.messages.size).toBe(before + 1)
    const rendered = bodies(store).at(-1) ?? ""
    expect(rendered).toContain(title)
    expect(rendered).toContain("```json")
  })

  // mvp.md Appendix B: the debug reads are hidden developer tools; hidden flows refuse the agent (263c41d3d8).
  test("the agent's invocation is refused and renders nothing; the human's door still returns the value", async () => {
    const store = await adminStore()
    const controller = createAppController(store, debugAgent(), {
      fetchImpl: async () => new Response("{}", { status: 200 })
    })
    const before = store.collections.messages.size
    expect((await controller.commands.runForAgent("debug.snapshot")).status).toBe("failed")
    expect(store.collections.messages.size).toBe(before)
    const outcome = await controller.commands.run("debug.snapshot")
    expect(outcome.status).toBe("executed")
    expect(outcome.status === "executed" ? outcome.value : undefined).toContain("surface")
  })

  /*
   * Production 20261015 (UI 10a823b3): ⌘K /debug.errors in a saved shared
   * conversation showed no answer at all. Its message exists, but a private
   * local message is only in the transcript beside shared turns when it says
   * whose branch it belongs to (`diagnosticVisible`), and this one read is the
   * only debug read that dispatches instead of going through surfaceDebugRead
   * — so it alone arrived unstamped and was filtered out of the view that
   * asked for it. The scope is this account's login and branch: never another
   * actor's history, and never published to the conversation.
   */
  test("/debug.errors answers the branch that asked, and only that branch", async () => {
    const store = await adminStore()
    const controller = createAppController(store, debugAgent(), {
      fetchImpl: async () => new Response("{}", { status: 200 })
    })
    controller.send("/debug.errors")
    await settled()
    await settled()
    const answer = [...store.collections.messages.values()].at(-1)!
    expect(answer.text).toContain("retained app history")
    expect(diagnosticVisible(answer, "will", "main")).toBe(true)
    expect(diagnosticVisible(answer, "ada", "main")).toBe(false)
    expect(diagnosticVisible(answer, "will", "feature")).toBe(false)
    // The structured read is the agent's channel; the stamp carries no payload.
    expect(answer.diagnostic).toEqual({ login: "will", branch: "main" })
  })

  test("the dev-tools panel's read never dispatches", async () => {
    const store = await adminStore()
    const controller = createAppController(store, debugAgent(), {
      fetchImpl: async () => new Response("{}", { status: 200 })
    })
    const before = store.collections.messages.size
    JSON.parse(controller.netTap())
    JSON.parse(controller.netTap())
    // The panel reads rows, not the serialized form; both stay silent.
    controller.netTapEntries()
    controller.netTapEntries()
    expect(store.collections.messages.size).toBe(before)
    expect(controller.netTapEntries()).toEqual(JSON.parse(controller.netTap()))
  })
})
