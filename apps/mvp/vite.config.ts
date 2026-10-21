import { join } from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { FRAME_POLICY, PAGE_HEADERS, shellCaches } from "./src/pwa.ts"

// The app's shell, for the service worker to precache: everything a reload needs before it reaches the network.
const SHELL = ["**/*.{js,css,html,woff2,svg,png}"]

// Never the service worker's: ChatApi, the Electric shape proxy, the telemetry relay and the model endpoint.
const API = /^\/api\//

// Alchemy injects the Cloudflare plugin, which runs worker/index.ts beside the app in dev and build.
export default defineConfig({
  plugins: [
    // The app's pages refuse to be framed under the dev server too, as public/_headers has Cloudflare serve them
    // (src/pwa.ts PAGE_HEADERS). Cloudflare's Vite plugin skips _headers in dev, so this sets them on every response
    // before any other middleware answers.
    {
      name: "smithers-page-headers",
      enforce: "pre",
      configureServer: (server) => {
        server.middlewares.use((_request, response, next) => {
          for (const [name, value] of Object.entries(PAGE_HEADERS)) response.setHeader(name, value)
          next()
        })
      },
    },
    react(),
    // The app is a PWA (docs/decisions/0011-the-agent-runs-in-the-browser.md §5): installable, and its service worker
    // serves the shell offline after one online visit (0002 §8). The service worker only serves files; it never runs
    // the flow engine, and never caches or answers /api/*.
    VitePWA({
      registerType: "autoUpdate",
      // The plugin adds the registration script to index.html, so the app's code registers nothing itself.
      injectRegister: "script-defer",
      // The shell's glob already lists the icons.
      includeManifestIcons: false,
      manifest: {
        name: "Smithers",
        short_name: "Smithers",
        start_url: "/app",
        scope: "/",
        display: "standalone",
        background_color: "#f7f6f1",
        theme_color: "#3a756b",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: SHELL,
        // The app's bundle and the engine worker are each over Workbox's 2 MiB default (2.7 and 2.3 MB on
        // 2026-10-20), which fails `vite build`; an offline reload needs both precached.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [API],
        cleanupOutdatedCaches: true,
        // A module the precache doesn't list (under the dev server, every one) is kept from the last visit, so an
        // offline reload still has it. The network answers first whenever it can.
        runtimeCaching: [
          {
            // Never an embedded page: another origin's, which this worker never sees (src/pwa.ts).
            urlPattern: shellCaches,
            handler: "NetworkFirst",
            options: { cacheName: "smithers-shell", networkTimeoutSeconds: 3 },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
        // Every app route falls back to the shell offline, as in production; /api/* never does.
        navigateFallbackAllowlist: [/^\/(?!api\/)/],
        // The dev service worker is generated here, outside the source tree.
        resolveTempFolder: () => join(import.meta.dirname, "node_modules", ".vite-pwa-dev"),
      },
    }),
    // What the app frames: only https: pages (src/pwa.ts FRAME_POLICY), in every build.
    {
      name: "smithers-frame-policy",
      transformIndexHtml: () => [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: FRAME_POLICY },
          injectTo: "head-prepend",
        },
      ],
    },
  ],
  worker: { format: "es" },
  server: { port: 5190, strictPort: true, fs: { strict: false } },
  build: { target: "esnext" },
})
