// What the PWA keeps and how the app's pages are framed (src/pwa.ts, docs/features/web-pages.md#the-app-around-a-frame).
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { FRAME_POLICY, PAGE_HEADERS, shellCaches } from "./pwa"

const APP = "https://app.smithers.sh"

const request = (url: string, destination: string, method = "GET") => ({
  url: new URL(url),
  sameOrigin: new URL(url).origin === APP,
  request: { method, destination },
})

describe("the service worker's shell", () => {
  test("keeps the app's own modules and pages, network first", () => {
    expect(shellCaches(request(`${APP}/src/main.tsx`, "script"))).toBe(true)
    expect(shellCaches(request(`${APP}/app`, "document"))).toBe(true)
  })

  test("never keeps an embedded page, the API, another origin or a write", () => {
    expect(shellCaches(request("https://example.com/", "iframe"))).toBe(false)
    expect(shellCaches(request(`${APP}/app`, "iframe"))).toBe(false)
    expect(shellCaches(request("https://example.com/app.js", "script"))).toBe(false)
    expect(shellCaches(request(`${APP}/api/shapes/views`, ""))).toBe(false)
    expect(shellCaches(request(`${APP}/src/main.tsx`, "script", "POST"))).toBe(false)
  })
})

describe("framing", () => {
  test("the app's pages refuse every frame, in development and on Cloudflare alike", () => {
    expect(PAGE_HEADERS).toEqual({ "Content-Security-Policy": "frame-ancestors 'none'", "X-Frame-Options": "DENY" })
    const served = readFileSync(join(import.meta.dirname, "..", "public", "_headers"), "utf8")
    expect(served).toMatch(/^\/\*$/m)
    for (const [name, value] of Object.entries(PAGE_HEADERS)) expect(served).toContain(`  ${name}: ${value}`)
  })

  test("the app frames only https: pages", () => {
    expect(FRAME_POLICY).toBe("frame-src https:")
  })
})
