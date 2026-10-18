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
