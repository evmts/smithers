/*
 * Hosted secrets authority (M-47): the card and the command door read the
 * repository's own permission. The seeded design world — the roster that
 * stands in off an install — calls a hosted repository's owner a member, so
 * before this it drew a heading over nothing for the person who owns it.
 */
import { act } from "react"
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { createRoot } from "./views/testDom"
import { SecretsCardBody, secretsCardFamily } from "./SecretsCard"
import { ControllerTestProvider } from "../ControllerContext"
import type { AppController } from "../state/AppController"
import type { Card } from "../state/AppState"
import { createRepositoryAuthoritySeam } from "../state/seams/RepositoryAuthority"
import type { SeamContext } from "../state/seams/SeamContext"
import { SecretsView } from "./views/SecretsView"
import { SecretsCardSchema } from "@smthrs/rpc/SecretsCard"

const empty: Extract<Card, { kind: "secrets" }> = {
  id: "secrets-ada/site", kind: "secrets", title: "Secrets · ada/site", status: "active", createdAt: 0, ordinal: 1,
  payload: { repo: "ada/site", scope: "repository", secrets: [] }
}

const authorityOf = (answer: (url: string) => Response, login: string | null = "ada") => {
  const urls: string[] = []
  return {
    urls,
    seam: createRepositoryAuthoritySeam({
      baseUrl: "https://host",
      http: async (url: string) => { urls.push(url); return answer(url) },
      store: { collections: { identitySessions: { get: (key: string) => key === "identity"
        ? login === null ? { state: "signed-out", revision: 1 }
          : { state: "signed-in", login, accountOwnerLogin: login, revision: 1, ownerRevision: 1 } : undefined } } }
    } as unknown as SeamContext, { ready: true })
  }
}

/* One snapshot object, not a new one per read: a mounted card re-renders forever otherwise. */
const noRoster = {}
const unanswered = { get: () => noRoster, subscribe: () => () => {} }
const submitted: Array<Record<string, unknown>> = []
const hosted = (secretAuthority: AppController["secretAuthority"]): AppController => ({
  membersRoster: unanswered,
  membersRole: () => "member",
  bootstrap: { host: "cloud", capabilities: ["agent", "cloud"] },
  secretsProviders: undefined,
  secretAuthority,
  live: { subscribe: () => () => {}, getSnapshot: () => undefined },
  commands: { submit: async (request: Record<string, unknown>) => { submitted.push(request); return { status: "done" } } }
} as unknown as AppController)

/* An install whose live secrets topic answers; `error` is a read that failed. */
const installed = (snapshot: { readonly topic: string; readonly data?: unknown; readonly error?: string }, role: "owner" | "member" = "owner"): AppController => ({
  membersRoster: unanswered,
  membersRole: () => "member",
  bootstrap: { host: "local", capabilities: ["install"] },
  secretsProviders: {
    View: SecretsView, decoder: SecretsCardSchema, authority: () => role,
    live: { subscribe: () => () => {}, getSnapshot: () => snapshot },
    catalog: () => [{ name: "secrets" }], scopedWrite: async () => new Response("{}"), family: { secrets: {} }
  },
  secretAuthority: undefined,
  live: { subscribe: () => () => {}, getSnapshot: () => snapshot },
  commands: { submit: async (request: Record<string, unknown>) => { submitted.push(request); return { status: "done" } } }
} as unknown as AppController)

const render = (controller: AppController, card = empty) => renderToStaticMarkup(
  <ControllerTestProvider controller={controller}>
    {secretsCardFamily.secrets.render(card, { onAction: () => {}, onView: () => {}, gestures: {} } as never)}
  </ControllerTestProvider>
)

test("an empty card is never a heading over nothing", () => {
  // What the production card drew: the seeded roster calls everyone a member,
  // so the first secret had no control and no reason beside it.
  const markup = render(hosted(undefined))
  expect(markup).toContain('data-kind="secrets"')
  expect(markup).not.toContain("Add")
  expect(markup).toContain("No secrets; read only.")
})

test("a hosted repository's owner and administrator may start Add", async () => {
  for (const permission of ["owner", "admin"] as const) {
    const { seam } = authorityOf(() => Response.json({ permission }))
    await seam.read("ada/site")
    const markup = render(hosted(seam))
    expect(markup).toContain('data-flow="secrets"')
    expect(markup).toContain("Add")
    expect(markup).toContain('type="password"')
    expect(markup).not.toContain("No secrets")
  }
})

test("a writer, a refused viewer and an unknown viewer get the read-only state", async () => {
  for (const answer of [Response.json({ permission: "write" }), new Response("", { status: 403 })]) {
    const { seam } = authorityOf(() => answer)
    await seam.read("ada/site")
    const markup = render(hosted(seam))
    expect(markup).not.toContain("Add")
    expect(markup).not.toContain('type="password"')
    expect(markup).toContain("No secrets; read only.")
  }
})

test("an authority still being read offers no form, and one that failed offers Retry", async () => {
  const pending = authorityOf(() => Response.json({ permission: "owner" }))
  pending.seam.ensure("ada/site")
  const loading = render(hosted(pending.seam))
  expect(loading).toContain("Checking access")
  expect(loading).not.toContain('type="password"')

  const broken = authorityOf(() => new Response("", { status: 503 }))
  await broken.seam.read("ada/site")
  const markup = render(hosted(broken.seam))
  expect(markup).toContain("Access unknown.")
  expect(markup).toContain("Retry")
  expect(markup).not.toContain('type="password"')
  expect(broken.urls).toHaveLength(1)
})

test("Retry runs the same read door and asks the authority again", async () => {
  let status = 503
  const broken = authorityOf(() => status === 200 ? Response.json({ permission: "owner" }) : new Response("", { status }))
  await broken.seam.read("ada/site")
  let props!: { actions: ReadonlyArray<{ label: string; tag: string }>; onAction: (tag: string, input?: Record<string, string>) => void }
  const submits: unknown[] = []
  renderToStaticMarkup(<SecretsCardBody card={empty} role="owner" access="unreadable"
    dispatch={(tag, input) => { submits.push({ tag, input }); return undefined }}
    View={value => { props = value as never; return null }} />)
  expect(props.actions.map(action => action.label)).toEqual(["Retry"])
  status = 200
  props.onAction("secrets", {})
  expect(submits).toEqual([{ tag: "secrets", input: {} }])
})

test("one repository's owner role never unlocks another repository's card", async () => {
  const { seam } = authorityOf(url => Response.json({ permission: url.endsWith("/ada/site") ? "owner" : "read" }))
  await seam.read("ada/site")
  await seam.read("ada/other")
  expect(render(hosted(seam))).toContain("Add")
  const other = { ...empty, id: "secrets-ada/other", title: "Secrets · ada/other", payload: { ...empty.payload, repo: "ada/other" } }
  expect(render(hosted(seam), other)).not.toContain("Add")
})

test("a loading or failed authority binds no write, whatever role it is handed", () => {
  for (const access of ["loading", "unreadable"] as const) {
    let props!: { actions: ReadonlyArray<{ label: string }>; model: { secrets: ReadonlyArray<{ actions: ReadonlyArray<unknown> }> } }
    const markup = renderToStaticMarkup(<SecretsCardBody card={empty} role="owner" access={access} dispatch={() => undefined}
      View={value => { props = value as never; return null }} />)
    expect(props.actions.map(action => action.label)).toEqual(access === "unreadable" ? ["Retry"] : [])
    expect(renderToStaticMarkup(<SecretsCardBody card={empty} role="owner" access={access} dispatch={() => undefined} />))
      .not.toContain('type="password"')
    expect(markup).toBe(access === "loading" ? '<p class="secret-note">Checking access\u2026</p>' : '<p class="secret-note">Access unknown.</p>')
  }
})

test("the read-only state keeps product words and no value ever reaches the markup", async () => {
  const { lintText } = await import("./productWords")
  for (const copy of ["No secrets; read only.", "Checking access…", "Access unknown.", "Secrets couldn't be read.", "Retry"]) {
    expect(lintText(copy)).toEqual([])
  }
  const { seam } = authorityOf(() => Response.json({ permission: "owner", can_write: true }))
  await seam.read("ada/site")
  const markup = render(hosted(seam))
  expect(markup).not.toContain("/api/repos")
  expect(markup).not.toContain("permission")
})

/* The live topic is read on the client, so this one mounts rather than renders to markup. */
const mounted = (controller: AppController): string => {
  const host = document.createElement("div")
  const root = createRoot(host)
  act(() => { root.render(<ControllerTestProvider controller={controller}>
    {secretsCardFamily.secrets.render(empty, { onAction: () => {}, onView: () => {}, gestures: {} } as never)}
  </ControllerTestProvider>) })
  const text = host.textContent ?? ""
  act(() => root.unmount())
  return text
}

test("a metadata read that failed never claims the repository has no secrets", () => {
  // The live topic answered with a failure, so the card holds no list. Saying
  // "No secrets" here would publish a list nobody read.
  const failed = mounted(installed({ topic: "secrets", error: "unavailable" }))
  expect(failed).not.toContain("No secrets")
  expect(failed).toContain("Secrets couldn't be read.")
  // The platform's own words for the failure are not the card's copy.
  expect(failed).not.toContain("unavailable")
  // A read that answered an empty list is the other state, and says so.
  const read = mounted(installed({ topic: "secrets", data: { secrets: [] } }, "member"))
  expect(read).toContain("No secrets; read only.")
  expect(read).not.toContain("couldn")
})

test("an install whose secrets provider arrives late re-renders instead of breaking", () => {
  /*
   * The card returns nothing until the install's own secrets provider is
   * there, and that provider arrives after the catalog does. Every hook this
   * card holds has to be held on both of those renders.
   */
  let ready = false
  const snapshot = { topic: "secrets", data: { secrets: [] } }
  const controller = {
    membersRoster: unanswered,
    membersRole: () => "member",
    bootstrap: { host: "local", capabilities: ["install"] },
    secretsProviders: {
      View: SecretsView, decoder: SecretsCardSchema, authority: () => "member",
      live: { subscribe: () => () => {}, getSnapshot: () => snapshot },
      catalog: () => ready ? [{ name: "secrets" }] : [], scopedWrite: async () => new Response("{}"), family: { secrets: {} }
    },
    secretAuthority: undefined,
    live: { subscribe: () => () => {}, getSnapshot: () => snapshot },
    commands: { submit: async () => ({ status: "done" }) }
  } as unknown as AppController
  const tree = () => <ControllerTestProvider controller={controller}>
    {secretsCardFamily.secrets.render(empty, { onAction: () => {}, onView: () => {}, gestures: {} } as never)}
  </ControllerTestProvider>
  const host = document.createElement("div")
  const root = createRoot(host)
  act(() => { root.render(tree()) })
  expect(host.textContent).toBe("")
  ready = true
  act(() => { root.render(tree()) })
  expect(host.textContent).toContain("No secrets; read only.")
  act(() => root.unmount())
})
