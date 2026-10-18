import { expect, test } from "bun:test"
import { secretsFlows } from "./secrets"
import type { CommandActions } from "./Declare"
import { createRepositoryAuthoritySeam } from "../../state/seams/RepositoryAuthority"
import type { SeamContext } from "../../state/seams/SeamContext"

const authority = (permissions: Readonly<Record<string, string>>) => {
  const urls: string[] = []
  const seam = createRepositoryAuthoritySeam({
    baseUrl: "https://host",
    http: async (url: string) => {
      urls.push(url)
      const repo = url.replace("https://host/api/repos/", "")
      const permission = permissions[repo]
      return permission === undefined ? new Response("", { status: 503 }) : Response.json({ permission })
    },
    store: { collections: { identitySessions: { get: (key: string) => key === "identity"
      ? { state: "signed-in", login: "ada", accountOwnerLogin: "ada", revision: 1, ownerRevision: 1 } : undefined } } }
  } as unknown as SeamContext, { ready: true })
  return { urls, seam }
}

const preflight = (actions: Partial<CommandActions>) => {
  const entry = secretsFlows(actions as CommandActions).find(row => row.declaredName === "secrets")!
  return entry.preflight!
}

test("the repository's own permission opens or closes the write door", async () => {
  const { seam } = authority({ "ada/site": "owner", "ada/api": "admin", "ada/docs": "write", "ada/public": "read" })
  const door = preflight({ secretAuthority: seam, activeRepository: () => "ada/site" })
  expect(await door({ operation: "set", name: "A", value: "v" })).toBeUndefined()
  expect(await door({ operation: "set", name: "A", value: "v", repo: "ada/api" })).toBeUndefined()
  expect(await door({ operation: "set", name: "A", value: "v", repo: "ada/docs" })).toBe("Maintainer required")
  expect(await door({ operation: "set", name: "A", value: "v", repo: "ada/public" })).toBe("Maintainer required")
})

test("a named repository uses its own permission, never the selected one's", async () => {
  const { seam } = authority({ "ada/site": "owner", "ada/docs": "write" })
  const door = preflight({ secretAuthority: seam, activeRepository: () => "ada/site" })
  expect(await door({ operation: "delete", name: "A", repo: "ada/docs" })).toBe("Maintainer required")
  const other = preflight({ secretAuthority: seam, activeRepository: () => "ada/docs" })
  expect(await other({ operation: "delete", name: "A", repo: "ada/site" })).toBeUndefined()
})

test("an unreadable authority refuses honestly instead of opening a form", async () => {
  const { seam } = authority({})
  const door = preflight({ secretAuthority: seam, activeRepository: () => "ada/site" })
  const refusal = await door({ operation: "set", name: "A", value: "v" })
  expect(refusal).toContain("Access to ada/site is unknown.")
  expect(refusal).not.toContain("api/repos")
})

test("a seeded roster role never authorizes a hosted write", async () => {
  // The design world's owner: real on a seeded fixture, no authority on a
  // hosted repository, where the repository's own permission is the only word.
  const { seam } = authority({ "ada/site": "write" })
  const door = preflight({ secretAuthority: seam, activeRepository: () => "ada/site",
    snapshot: () => ({ viewerRole: "owner" }) as never })
  expect(await door({ operation: "set", name: "A", value: "v" })).toBe("Maintainer required")
})

test("a list needs no authority", async () => {
  const { seam, urls } = authority({ "ada/site": "read" })
  const door = preflight({ secretAuthority: seam, activeRepository: () => "ada/site" })
  expect(await door({})).toBeUndefined()
  expect(urls).toEqual([])
})

test("off a hosted repository the install's own providers still answer", async () => {
  const door = preflight({ secretsProviders: { authority: () => "maintainer" } as never,
    snapshot: () => ({ viewerRole: undefined }) as never })
  expect(await door({ operation: "set", name: "A", value: "v" })).toBeUndefined()
  const refused = preflight({ secretsProviders: { authority: () => "member" } as never,
    snapshot: () => ({ viewerRole: undefined }) as never })
  expect(await refused({ operation: "set", name: "A", value: "v" })).toBe("Maintainer required")
})
