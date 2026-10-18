// The site Worker (worker/index.ts): /api/* goes to ChatApi over its service binding, every other path to the app's
// assets. The bindings are Cloudflare's, so they are the seam: each answers with its own name.
import { expect, test } from "vitest"
import site from "./index.ts"

const binding = (name: string, seen: Array<string>) =>
  ({
    fetch: async (request: Request) => {
      seen.push(`${name} ${request.method} ${new URL(request.url).pathname}`)
      return new Response(name)
    },
  }) as unknown as Fetcher

test.each([
  ["POST", "/api/questions", "CHAT_API"],
  ["GET", "/api/shapes/messages?offset=-1", "CHAT_API"],
  ["POST", "/api/telemetry/v1/logs", "CHAT_API"],
  ["GET", "/app", "ASSETS"],
  ["GET", "/", "ASSETS"],
  ["GET", "/api", "ASSETS"],
  ["GET", "/apis/x", "ASSETS"],
])("%s %s goes to %s, unchanged", async (method, path, to) => {
  const seen: Array<string> = []
  const env = { CHAT_API: binding("CHAT_API", seen), ASSETS: binding("ASSETS", seen) }
  const request = new Request(`https://smithers.test${path}`, { method })
  const response = await site.fetch(request as Parameters<typeof site.fetch>[0], env)
  expect(await response.text()).toBe(to)
  expect(seen).toEqual([`${to} ${method} ${path.split("?")[0]}`])
})
