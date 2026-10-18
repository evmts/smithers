import { test, expect } from "bun:test"
import { defaultWorld } from "./worlds/default"
import { validateFixtures } from "./validate"
import { readRoutes } from "./routes/reads"
import { matchRoute } from "./route"

test("all identity and data variants decode at their RPC boundaries", () => {
  expect(validateFixtures()).toBe(828)
  const member = defaultWorld(new URLSearchParams("as=member&data=empty&net=slow"))
  expect(member.viewer?.username).toBe("maya")
  expect(member.variants).toEqual({ as: "member", data: "empty", net: "slow" })
  expect(defaultWorld(new URLSearchParams("net=error")).variants.net).toBe("error")
})
test("a corrupted fixture fails the same validation used by specSite", () => {
  const bootstrap = readRoutes.find(r => r.path === "/api/bootstrap")!
  const original = bootstrap.handle
  try {
    Object.assign(bootstrap, { handle: () => ({ body: { apiVersion: 42 } }) })
    expect(() => validateFixtures()).toThrow()
  } finally { Object.assign(bootstrap, { handle: original }) }
})
test("route matching preserves encoded names and cannot swallow extra segments", () => {
  expect(matchRoute("/api/repos/:owner/:repo", "/api/repos/%zz/repo")).toBeUndefined()
  expect(matchRoute("/api/repos/:owner/:repo", "/api/repos/maya/tinyhttp/home")).toBeUndefined()
  expect(matchRoute("/api/repos/:owner/:repo/contents/*path", "/api/repos/maya/tinyhttp/contents/docs/a%20b.md")).toEqual({ owner: "maya", repo: "tinyhttp", path: "docs/a b.md" })
})

test("P1 denied repository uses the existing read-error wire contract", () => {
  const w = defaultWorld(new URLSearchParams({ as: "member", access: "denied" }))
  const handler = readRoutes.find(r => r.path === "/api/repos/:owner/:repo")!
  const response = handler.handle({ url: new URL("http://spec.test/api/repos/maya/tinyhttp"), params: { owner: "maya", repo: "tinyhttp" } }, w)
  expect(response.status).toBe(403)
  expect(handler.schema.parse(response.body)).toEqual({ message: "Repository access denied" })
})
