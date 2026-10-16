import { installFixture } from "../state/seams/InstallFixtures.test-support"
import { settingsCardModel } from "../state/seams/InstallModel"
import { ModelRoles } from "./ModelCards"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, describe, expect, test } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import type { Card } from "../state/AppState"
import { AgentsCardBody } from "./AgentCards"

/*
 * Agents as data (custom-agents.md): the Agents card's rows and acts, and
 * the models card. Every act is asserted as the flow it names. The New-agent
 * form is the generic flow form (FlowFormCards.test.tsx; CustomAgents.test.ts
 * renders it from the live harness seam).
 */

GlobalRegistrator.register()
const roots: Root[] = []

afterAll(async () => {
  for (const root of roots) flushSync(() => root.unmount())
  for (let tick = 0; tick < 3; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  await GlobalRegistrator.unregister()
})

type AgentsCard = Extract<Card, { kind: "agents" }>

const base = { title: "Agents", status: "active" as const, createdAt: 0, ordinal: 0 }

const agentsCard = (payload: AgentsCard["payload"]): AgentsCard => ({ ...base, id: "agents", kind: "agents", payload })

const orchestrator: Extract<AgentsCard["payload"], { native: boolean }>["agents"][number] = {
  id: "orchestrator",
  label: "Orchestrator",
  purpose: "Plans and delegates.",
  harness: "claude",
  harnessName: "Claude Code",
  model: { provider: "anthropic", id: "claude-fable-5", label: "Fable 5" },
  builtin: true,
  available: true,
  reason: "",
  account: "will@example.com"
}
const mount = (node: React.ReactNode): HTMLElement => {
  const host = document.createElement("div")
  document.body.append(host)
  flushSync(() => {
    const root = createRoot(host)
    roots.push(root)
    root.render(node)
  })
  return host
}

const recorder = () => {
  const calls: Array<[string, string | undefined]> = []
  return { calls, onRunCommand: (name: string, args?: string) => void calls.push([name, args]) }
}

const click = (host: HTMLElement, selector: string): void => {
  const element = host.querySelector<HTMLElement>(selector)
  if (element === null) throw new Error(`no element for ${selector}`)
  element.click()
}

describe("the Agents card", () => {
  /*
   * A card with no rows states the stage of the source that would have
   * answered them, and never a verdict the read did not reach (#3831): an
   * unread catalog is not a repository with no agents, a REFUSED read is
   * neither, and "Agents run on the native app's harnesses" named harnesses
   * that retired with the local backend and a host that answers for nothing.
   */
  test("with no rows it states the stage of the source, and offers no act", () => {
    const read = mount(<AgentsCardBody onRunCommand={() => {}} card={agentsCard({ native: false, inventory: "repository", agents: [] })} />)
    expect(read.textContent).toBe("No agents yet")
    expect(read.querySelector("[data-agents-source]")?.getAttribute("data-agents-source")).toBe("repository")
    expect(read.querySelector("[data-flow]")).toBeNull()

    const reading = mount(<AgentsCardBody onRunCommand={() => {}} card={agentsCard({ native: false, inventory: "reading", agents: [] })} />)
    expect(reading.textContent).toBe("Loading agents.")
    expect(reading.textContent).not.toContain("No agents")

    const none = mount(<AgentsCardBody onRunCommand={() => {}} card={agentsCard({ native: false, inventory: "no-repository", agents: [] })} />)
    expect(none.textContent).toBe("No repository is selected.")

    /* The host answered with none: that IS an empty inventory. */
    const host = mount(<AgentsCardBody onRunCommand={() => {}} card={agentsCard({ native: false, inventory: "host", agents: [] })} />)
    expect(host.textContent).toBe("No agents yet")

    /* A refused read is the refusal, never a repository that declares none. */
    const refused = mount(<AgentsCardBody onRunCommand={() => {}} card={agentsCard({ native: false, inventory: "unreadable", agents: [] })} />)
    expect(refused.textContent).toBe("Could not read agents")
    expect(refused.textContent).not.toContain("No agents")

    /*
     * A card written before the stage existed claims nothing of its own, and
     * renders no note rather than an empty one: a blank sentence is a blank
     * card body, which is its own defect.
     */
    const legacy = mount(<AgentsCardBody onRunCommand={() => {}} card={agentsCard({ native: false, agents: [] })} />)
    expect(legacy.textContent).toBe("")
    expect(legacy.querySelector("[data-agents-source]")).toBeNull()
    expect(legacy.querySelector("p")).toBeNull()
  })

  /*
   * The listing's own refusal used to be swallowed whenever the card held no
   * rows: the single sentence returned before the notice could render, so the
   * one reading that names a cause never reached the screen.
   */
  test("with no rows the listing's refusal still shows beside the stage", () => {
    const host = mount(<AgentsCardBody onRunCommand={() => {}} card={agentsCard({ native: false, inventory: "host", agents: [], error: "the host refused" })} />)
    expect(host.querySelector("[data-testid=\"agents-failure\"]")).not.toBeNull()
    expect(host.textContent).toContain("No agents yet")
  })

  test("a repository agent flow is a row like a built-in: label, model, and its Runs door is runs.list on its flow id", () => {
    const { calls, onRunCommand } = recorder()
    const reviewer: typeof orchestrator = {
      id: "checks/review",
      label: "checks/review",
      purpose: "Reviews the change.",
      model: { provider: "openai", id: "gpt-6-sol", label: "GPT-6 Sol" },
      builtin: false,
      available: false,
      reason: "",
      account: ""
    }
    const host = mount(<AgentsCardBody onRunCommand={onRunCommand} card={agentsCard({ native: false, agents: [orchestrator, reviewer] })} />)
    const row = host.querySelector<HTMLElement>('[data-agent="checks/review"]')
    expect(row?.textContent).toContain("checks/review")
    expect(row?.textContent).toContain("GPT-6 Sol")
    expect(row?.querySelector("[title]")?.getAttribute("title")).toBe("Reviews the change.")
    click(host, '[data-testid="agent-runs-checks/review"]')
    expect(calls).toEqual([["runs.list", JSON.stringify({ flow: "checks/review" })]])
  })

  test("the last act's refusal reads as one sentence; the server's words stay behind Details", () => {
    const host = mount(<AgentsCardBody onRunCommand={() => {}} card={agentsCard({ native: true, agents: [orchestrator], error: "The server answered 500" })} />)
    const alert = host.querySelector<HTMLElement>("[role=alert]")
    expect(alert?.dataset.testid).toBe("agents-failure")
    expect(alert?.dataset.fault).toBe("infra")
    expect(alert?.dataset.failure).toBe("AgentsFailed")
    expect(alert?.querySelector("p")?.textContent).toBe("Smithers could not update your agents. Not your fault.")
    expect(alert?.querySelector("p")?.textContent).not.toContain("500")
    expect(alert?.querySelector("details pre")?.textContent).toBe("The server answered 500")
    expect(alert?.querySelector("details")?.open).toBe(false)
    expect(alert?.querySelector("button")).toBeNull()
  })
})


test("the install projection shows instructions and source; only the owner gets assignment controls", () => {
 const agent = { ...orchestrator, id: "reviewer", label: "Reviewer agent", source: "owner" as const, instructions: "flows/todo/flow.ts", binding: { protocol: "openai-responses", modelId: "model-a", credential: "OPENAI_API_KEY" } }
 const recorded = recorder()
 const owner = mount(<AgentsCardBody card={agentsCard({ native: false, canAssign: true, agents: [agent] })} onRunCommand={recorded.onRunCommand} />)
 expect(owner.querySelector('[data-testid="agent-source-reviewer"]')?.textContent).toBe("owner")
 click(owner, '[data-testid="agent-model-reviewer"]')
 expect(recorded.calls[0]).toEqual(["model.assign", '{"role":"reviewer"}'])
 click(owner, '[data-flow="file"]')
 expect(recorded.calls[1]?.[0]).toBe("file")
 expect(recorded.calls[1]?.[1]).toContain("flows/todo/flow.ts")
 const member = mount(<AgentsCardBody card={agentsCard({ native: false, canAssign: false, agents: [agent] })} onRunCommand={recorded.onRunCommand} />)
 expect(member.querySelector('[data-flow="model.assign"]')).toBeNull()
 expect(member.querySelector('[data-flow="file"]')).not.toBeNull()
})

test("opening one agent filters the shared card to that role", () => {
 const reviewer = { ...orchestrator, id: "reviewer", label: "Reviewer agent" }
 const host = mount(<AgentsCardBody card={agentsCard({ native: false, selectedAgent: "reviewer", agents: [orchestrator, reviewer] })} onRunCommand={() => {}} />)
 expect(host.querySelectorAll("[data-agent]")).toHaveLength(1)
 expect(host.querySelector("[data-agent]")?.getAttribute("data-agent")).toBe("reviewer")
})

test("Settings displays the assigned model in the shared Models section", () => {
 const served = installFixture()
 served.models[1]!.model = "model-b"
 const host = mount(<ModelRoles model={settingsCardModel(served, "http://localhost:4000")} actions={[]} onAction={() => {}} />)
 expect(host.querySelector('[data-testid="settings-model-coding"]')?.textContent).toBe("model-b")
})


test("the Agent card shows actual models from recent runs after the assigned model changes", () => {
 const agent = { ...orchestrator, id: "app", label: "App agent", model: { provider: "openai", id: "new-model", label: "new-model" }, runs: [{ id: "turn-before-switch", model: "old-model" }, { id: "turn-after-switch", model: "new-model" }] }
 const host = mount(<AgentsCardBody card={agentsCard({ native: false, install: true, canAssign: false, agents: [agent] })} onRunCommand={() => {}} />)
 const runs = host.querySelector('[data-testid="agent-recent-runs-app"]')
 expect(runs?.textContent).toContain("turn-before-switch · old-model")
 expect(runs?.textContent).toContain("turn-after-switch · new-model")
 expect(host.querySelector('[data-flow="model.assign"]')).toBeNull()
})
