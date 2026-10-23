import { createServer } from "node:http"
import { once } from "node:events"
import type { AddressInfo } from "node:net"
import { request } from "@playwright/test"
import { afterEach, expect, test, vi } from "vitest"
import { github, pollGitHub } from "./github"

afterEach(() => vi.unstubAllEnvs())

// Real HTTP through Playwright's request client; only the endpoint and environment are configured.
test("GitHub verification authenticates when configured, and fails immediately on refusals", async () => {
  let calls = 0
  const seen: Array<{ url: string; accept: string | undefined; authorization: string | undefined }> = []
  const server = createServer((req, res) => {
    calls++
    seen.push({ url: req.url!, accept: req.headers.accept, authorization: req.headers.authorization })
    res.writeHead(Number(req.url?.slice(1)), { "content-type": "application/json" })
    res.end(JSON.stringify({ title: "An issue" }))
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const client = await request.newContext()
  const page = { request: client }
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    vi.stubEnv("E2E_GITHUB_TOKEN", "fixture-token")
    expect(await github(page, `${origin}/200`)).toEqual({ title: "An issue" })
    vi.stubEnv("E2E_GITHUB_TOKEN", "")
    await github(page, `${origin}/200`)
    vi.stubEnv("E2E_GITHUB_TOKEN", undefined)
    await github(page, `${origin}/200`)
    expect(seen).toEqual([
      { url: "/200", accept: "application/vnd.github+json", authorization: "Bearer fixture-token" },
      { url: "/200", accept: "application/vnd.github+json", authorization: undefined },
      { url: "/200", accept: "application/vnd.github+json", authorization: undefined },
    ])
    for (const status of [403, 429, 500]) {
      const before = calls
      await expect(pollGitHub(() => github(page, `${origin}/${status}`), () => false))
        .rejects.toThrow(status === 500 ? `GitHub's ${origin}/500: HTTP 500` : `GitHub's ${origin}/${status}: HTTP ${status}; access refused or rate limited. Check E2E_GITHUB_TOKEN and GitHub's rate limit.`)
      expect(calls - before).toBe(1)
    }
    let reads = 0
    expect(await pollGitHub(async () => ++reads, (value) => value === 2)).toBe(2)
    expect(reads).toBe(2)
  } finally {
    await client.dispose()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
