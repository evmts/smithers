/*
 * Hosted secrets authority (M-47): the card and the command door read the
 * repository's own permission. The seeded design world — the roster that
 * stands in off an install — calls a hosted repository's owner a member, so
 * before this it drew a heading over nothing for the person who owns it.
 */
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SecretsCardBody, secretsCardFamily } from "./SecretsCard"
import { ControllerTestProvider } from "../ControllerContext"
import type { AppController } from "../state/AppController"
import type { Card } from "../state/AppState"
import { createRepositoryAuthoritySeam } from "../state/seams/RepositoryAuthority"
import type { SeamContext } from "../state/seams/SeamContext"

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

const unanswered = { get: () => ({}), subscribe: () => () => {} }
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
  expect(markup).toContain("No secrets; only a maintainer can add one.")
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
    expect(markup).toContain("No secrets; only a maintainer can add one.")
  }
})

test("an authority still being read offers no form, and one that failed offers Retry", async () => {
  const pending = authorityOf(() => Response.json({ permission: "owner" }))
  pending.seam.refresh("ada/site")
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
  for (const copy of ["No secrets; only a maintainer can add one.", "Checking access…", "Access unknown.", "Retry"]) {
    expect(lintText(copy)).toEqual([])
  }
  const { seam } = authorityOf(() => Response.json({ permission: "owner", can_write: true }))
  await seam.read("ada/site")
  const markup = render(hosted(seam))
  expect(markup).not.toContain("/api/repos")
  expect(markup).not.toContain("permission")
})
