import { expect, test } from "bun:test"
import { createRepositoryAuthoritySeam, secretRoleOf } from "./RepositoryAuthority"
import type { SeamContext } from "./SeamContext"

const identity = (login: string | null, revision = 1) => ({
  get: (key: string) => key === "identity"
    ? login === null
      ? { state: "signed-out" as const, revision }
      : { state: "signed-in" as const, login, accountOwnerLogin: login, revision, ownerRevision: revision }
    : undefined
})

const seam = (answer: (url: string) => Response | Promise<Response>, login: string | null = "ada", revision = 1) => {
  const urls: string[] = []
  const ctx = {
    baseUrl: "https://host",
    http: async (url: string) => { urls.push(url); return answer(url) },
    store: { collections: { identitySessions: identity(login, revision) } }
  } as unknown as SeamContext
  return { urls, authority: createRepositoryAuthoritySeam(ctx, { ready: true }) }
}

test("the repository's own permission decides secret authority", async () => {
  for (const [permission, role] of [["owner", "owner"], ["admin", "maintainer"], ["write", "member"], ["read", "member"]] as const) {
    const { authority, urls } = seam(() => Response.json({ permission, can_write: permission !== "read" }))
    expect(await authority.read("ada/site")).toEqual({ phase: "ready", repo: "ada/site", permission, role })
    expect(urls).toEqual(["https://host/api/repos/ada/site"])
  }
})

test("a writer who is not an administrator cannot start Add", async () => {
  const { authority } = seam(() => Response.json({ permission: "write", can_write: true }))
  const scoped = await authority.read("ada/site")
  expect(scoped.phase === "ready" && scoped.role).toBe("member")
})

test("an answer with no permission is unreadable, not an empty grant", async () => {
  const { authority } = seam(() => Response.json({ can_write: true }))
  expect(await authority.read("ada/site")).toEqual({ phase: "unreadable", repo: "ada/site", message: "Access to ada/site is unknown." })
})

test("a refusal settles with no authority and no retry; an outage asks again", async () => {
  const refused = seam(() => new Response("", { status: 403 }))
  expect(await refused.authority.read("ada/site")).toEqual({ phase: "refused", repo: "ada/site" })
  refused.authority.ensure("ada/site")
  expect(refused.urls).toHaveLength(1)

  let status = 503
  const broken = seam(() => new Response("", { status }))
  const first = await broken.authority.read("ada/site")
  expect(first.phase).toBe("unreadable")
  status = 200
  broken.authority.ensure("ada/site")
  await Promise.resolve()
  expect(broken.urls).toHaveLength(2)
})

test("a failed read is never the answer to the next ask", async () => {
  let status = 503
  const { authority, urls } = seam(() => status === 200 ? Response.json({ permission: "owner" }) : new Response("", { status }))
  expect((await authority.read("ada/site")).phase).toBe("unreadable")
  status = 200
  // The second ask reads again instead of repeating the outage as a verdict.
  expect(await authority.read("ada/site")).toEqual({ phase: "ready", repo: "ada/site", permission: "owner", role: "owner" })
  expect(urls).toHaveLength(2)
})

test("ensure is render-safe: a settled answer is never read twice", async () => {
  for (const answer of [Response.json({ permission: "owner" }), new Response("", { status: 404 })]) {
    const { authority, urls } = seam(() => answer.clone())
    authority.ensure("ada/site")
    authority.ensure("ada/site")
    expect(urls).toHaveLength(1)
    await authority.read("ada/site")
    for (let render = 0; render < 5; render += 1) authority.ensure("ada/site")
    await Promise.resolve()
    expect(urls).toHaveLength(1)
  }
})

test("a thrown request is unreadable, never a role", async () => {
  const { authority } = seam(() => { throw new Error("offline") })
  expect(await authority.read("ada/site")).toEqual({ phase: "unreadable", repo: "ada/site", message: "Access to ada/site is unknown." })
})

test("one repository's owner role is not lent to another repository", async () => {
  const { authority } = seam(url => Response.json({ permission: url.endsWith("/ada/site") ? "owner" : "read" }))
  expect((await authority.read("ada/site") as { role: string }).role).toBe("owner")
  expect((await authority.read("ada/other") as { role: string }).role).toBe("member")
  expect(authority.state("ada/other")).toEqual({ phase: "ready", repo: "ada/other", permission: "read", role: "member" })
})

test("a changed identity retires the answer the previous one earned", async () => {
  let login = "ada"
  let revision = 1
  const urls: string[] = []
  const ctx = {
    baseUrl: "https://host",
    http: async (url: string) => { urls.push(url); return Response.json({ permission: login === "ada" ? "owner" : "read" }) },
    store: { collections: { identitySessions: { get: (key: string) => key === "identity"
      ? { state: "signed-in" as const, login, accountOwnerLogin: login, revision, ownerRevision: revision } : undefined } } }
  } as unknown as SeamContext
  const authority = createRepositoryAuthoritySeam(ctx, { ready: true })
  expect((await authority.read("ada/site") as { role: string }).role).toBe("owner")
  login = "bo"; revision = 2
  authority.identityChanged()
  expect(authority.state("ada/site")).toEqual({ phase: "unscoped" })
  expect((await authority.read("ada/site") as { role: string }).role).toBe("member")
  expect(urls).toHaveLength(2)
})

test("a guest never wakes a repository authority read", async () => {
  const { authority, urls } = seam(() => Response.json({ permission: "owner" }), null)
  expect(await authority.read("ada/site")).toEqual({ phase: "unscoped" })
  authority.ensure("ada/site")
  expect(urls).toEqual([])
})

test("an unnamed or malformed repository is never in scope", async () => {
  const { authority, urls } = seam(() => Response.json({ permission: "owner" }))
  expect(await authority.read(undefined)).toEqual({ phase: "unscoped" })
  expect(await authority.read("not-a-repo")).toEqual({ phase: "unscoped" })
  expect(urls).toEqual([])
})

test("secretRoleOf never rounds a writer up", () => {
  expect(secretRoleOf("owner")).toBe("owner")
  expect(secretRoleOf("admin")).toBe("maintainer")
  expect(secretRoleOf("write")).toBe("member")
  expect(secretRoleOf("read")).toBe("member")
  expect(secretRoleOf(undefined)).toBe("member")
})
