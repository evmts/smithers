import { defineConfig } from "@playwright/test"
import { DEV_URL } from "./dev/https.ts"

// Real browsers against the real app, Worker, Durable Object and model: no mocks.
// BASE_URL points the tests at a deployment; without it, Playwright starts `alchemy dev`
// (which needs the chat model's credential, CEREBRAS_API_KEY by default, in the environment).
// Locally the tests open the dev server over HTTPS and HTTP/2 (dev/https.ts), as production serves the app.
const baseURL = process.env.BASE_URL ?? DEV_URL
// The dev server on this machine, on whatever port: its certificate may be self-signed (dev/https.ts).
const local = /^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(baseURL)

// Every test records its page at the size it renders, a laptop's window, 1:1: `pnpm e2e:gifs` never zooms or crops it
// (Will, 2026-10-20: "video is too zoomed in"). e2e/devices.ts opens each device at the same size.
const viewport = { width: 1280, height: 800 }

export default defineConfig({
  testDir: "e2e",
  // Only specs: e2e/*.test.ts are the media scripts' unit tests, which vitest runs.
  testMatch: "**/*.spec.ts",
  timeout: 90_000,
  use: {
    baseURL,
    viewport,
    video: { mode: "on", size: viewport },
    trace: "retain-on-failure",
    // A machine whose browsers don't trust its dev certificate, such as one without mkcert, made a self-signed one
    // (docs/infrastructure.md#https-and-http2). The flag, not only `ignoreHTTPSErrors`, lets the service worker
    // register over it. A deployment's certificate is always checked.
    ignoreHTTPSErrors: local,
    launchOptions: { args: local ? ["--ignore-certificate-errors"] : [] },
  },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: "pnpm dev", url: baseURL, ignoreHTTPSErrors: true, reuseExistingServer: true, timeout: 120_000 },
})
