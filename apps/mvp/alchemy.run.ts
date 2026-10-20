/**
 * Alchemy stack for the from-scratch app. Importing it deploys nothing.
 *
 * Two Cloudflare Workers:
 * - ChatApi (worker/ChatApi.ts): an Effect-native Worker that answers /api/*: questions, the Electric shape proxy
 *   and the browser's telemetry. It reaches Postgres through Hyperdrive. Alchemy runs its handlers.
 * - The site (Vite build + worker/index.ts): serves the app and hands /api/* to ChatApi over a service binding.
 *
 * Postgres and Electric run beside the stack: `pnpm db:up` locally, managed services in production
 * (docs/infrastructure.md).
 *
 * Dev:     pnpm dev        (alchemy dev: Vite + both Workers in local workerd, state in .alchemy/)
 * Deploy:  pnpm deploy     (needs CLOUDFLARE_API_TOKEN, ALCHEMY_PASSWORD and the secrets in docs/infrastructure.md)
 * Destroy: pnpm destroy
 *
 * ChatApi reads its settings with Effect Config; see docs/features/chat.md#configuration.
 */
import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import { Effect } from "effect"
import ChatApi from "./worker/ChatApi.ts"

// Local dev keeps state in .alchemy/ with no Cloudflare account; deploys keep it in the account's state store.
const state = process.env.ALCHEMY_DEV === "true" ? Alchemy.localState() : Cloudflare.state()

export default Alchemy.Stack(
  "smithers-mvp",
  { providers: Cloudflare.providers(), state },
  Effect.gen(function* () {
    const chatApi = yield* ChatApi
    const site = yield* Cloudflare.Website.Vite("smithers-mvp", {
      main: "worker/index.ts",
      compatibility: { date: "2026-10-01", flags: ["enable_request_signal"] },
      // The Worker answers /api/*; every other path is the single-page app.
      assets: { notFoundHandling: "single-page-application", runWorkerFirst: ["/api/*"] },
      env: { CHAT_API: chatApi },
      // Workers Logs and Traces for the site's requests, kept like ChatApi's.
      observability: {
        enabled: true,
        logs: { enabled: true, invocationLogs: true, persist: true },
        traces: { enabled: true, persist: true },
      },
    })
    return { url: site.url }
  }),
)
