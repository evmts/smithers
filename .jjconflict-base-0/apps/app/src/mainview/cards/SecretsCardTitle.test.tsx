/*
 * One visible title on the Secrets card (#4056).
 *
 * Production UI 2fca5dd1 drew the card frame's own title — "Secrets ·
 * owner/repository", set by `SecretsSeam.ts` — and then `SecretsView.tsx`
 * drew `<h2>Secrets</h2>` straight under it, so a small settings card opened
 * with its name twice.
 *
 * Counting heading roles cannot see that: the frame's title is a `<span>`,
 * not a heading, so a card with one heading and one framed title still reads
 * as two titles to a person. These cases therefore render the REAL frame
 * over the REAL card the `/secrets` flow published and read the visible text
 * of the whole card, while holding the three things the fix must not cost:
 * the section's accessible name, the repository in the title, and the rows
 * and write controls the card already had.
 */
import { act } from "react"
import { expect, test } from "bun:test"
import { createRoot } from "./views/testDom"
import { ControllerTestProvider } from "../ControllerContext"
import { CardView } from "../ChatCards"
import { createAppController, type AppController, type AppServices } from "../state/AppController"
import { createAppStore, type AppStore } from "../state/AppStore"
import { json, memoryStorage } from "../state/TestFixtures"
import type { AgentPort } from "../runtime/AgentPort"

const REPO = "will/flows"

const unavailableAgent: AgentPort = {
  available: false,
  startTurn: async () => ({ status: "error", message: "unavailable" }),
  cancelTurn: async () => {},
  subscribe: () => () => {}
}

/* The platform answers one repository's secret METADATA; no value is on the wire. */
const services = (permission: "owner" | "member"): AppServices => ({
  bootstrap: { apiVersion: 1, host: "cloud", version: "test", buildSha: "test",
    capabilities: ["identity", "cloud"], authFlow: "credentials", sandbox: null },
  fetchImpl: async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === `/api/repos/${REPO}`) return json(200, { permission })
    if (url === `/api/repos/${REPO}/secrets` && (init?.method ?? "GET") === "GET") {
      return json(200, [{ name: "NPM_TOKEN", main_only: true, hosts: ["registry.npmjs.org"],
        match_headers: ["authorization"], updated_at: "2026-10-16T09:58:00.000Z" }])
    }
    return json(404, { message: `no stub for ${url}` })
  }
})

const settle = async (times = 6): Promise<void> => {
  await act(async () => { for (let i = 0; i < times; i++) await new Promise(resolve => setTimeout(resolve, 1)) })
}

const listed = async (permission: "owner" | "member") => {
  const store = await createAppStore({ kind: "localStorage", storage: memoryStorage() })
  const controller = createAppController(store, unavailableAgent, services(permission))
  await store.dispatch({ type: "identity.session.loaded", actor: "system", state: "signed-in", login: "will", admin: false, scopesPlain: null }).isPersisted.promise
  await store.dispatch({ type: "repositories.loaded", actor: "system",
    repositories: [{ id: REPO, org: "will", ownerKind: "user", name: "flows", head: null }] }).isPersisted.promise
  expect(await controller.commands.run("secrets")).toMatchObject({ status: "executed" })
  return { store, controller }
}

/** The card as the transcript draws it: the shell's frame around the card's own body. */
const drawn = (controller: AppController, store: AppStore) => {
  const card = store.collections.cards.get(`secrets-${REPO}`)!
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const noop = () => {}
  const draw = () => act(() => root.render(<ControllerTestProvider controller={controller}>
    <CardView card={card} maximized={false} onMaximize={noop} onMinimize={noop} onDecideApproval={noop}
      onConnectGitHub={noop} onRunWorkflow={noop} onStopRun={noop} onRetryRun={noop} onChooseWorkflowRepo={noop}
      worldDocuments={[]} onChangeWorldDocument={noop} onRunCommand={noop} />
  </ControllerTestProvider>))
  draw()
  return {
    card,
    draw,
    frame: () => host.querySelector(".smithers-card")!,
    /** Every visible run of text the card draws, in document order. */
    text: () => (host.querySelector(".smithers-card") as HTMLElement).textContent ?? "",
    close: () => act(() => root.unmount())
  }
}

/** How many times the card's visible text names the subject. */
const named = (text: string, subject: string): number => text.split(subject).length - 1

for (const permission of ["owner", "member"] as const) test(`the ${permission}'s Secrets card shows its name once, with the repository`, async () => {
  const { store, controller } = await listed(permission)
  try {
    await settle()
    const view = drawn(controller, store)
    try {
      // The repository's authority answers after the mount asked for it.
      await settle()
      view.draw()
      // The card the flow published carries the frame's title.
      expect(view.card.title).toBe(`Secrets · ${REPO}`)
      /*
       * The defect, stated as a person sees it: the whole rendered card —
       * frame included — names "Secrets" exactly once. A second large
       * "Secrets" from the view puts it at two.
       */
      expect(named(view.text(), "Secrets")).toBe(1)
      // And the one title it keeps is the framed one, with the repository on it.
      expect(view.frame().querySelector(".smithers-card-title")?.textContent).toBe(`Secrets · ${REPO}`)
      // The accessible section name survives: this is how the suites find it.
      const section = view.frame().querySelector('[data-kind="secrets"]')!
      expect(section.getAttribute("aria-label")).toBe("Secrets")
      expect(section.getAttribute("data-keyboard-pane")).toBe("Secrets")
      // The rows and the authority the card already had are untouched.
      expect(view.text()).toContain("NPM_TOKEN")
      expect(view.text()).toContain("main only")
      // Add and the row's Replace for the owner; a member writes nothing.
      const masked = [...view.frame().querySelectorAll<HTMLInputElement>('input[type="password"]')]
      expect(masked.length).toBe(permission === "owner" ? 2 : 0)
      // Write-only stays write-only, whatever the title does.
      for (const field of masked) expect(field.value).toBe("")
      expect(view.frame().innerHTML).not.toContain("NPM_TOKEN\" value=")
    } finally { view.close() }
  } finally { await controller.dispose() }
})
