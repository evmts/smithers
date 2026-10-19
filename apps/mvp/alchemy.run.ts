/**
 * Alchemy stack for the from-scratch app. Importing it deploys nothing.
 *
 * Two Cloudflare Workers:
 * - ChatApi (worker/ChatApi.ts): an Effect-native Worker that answers POST /api/chat. Alchemy runs its handler.
 * - The site (Vite build + worker/index.ts): serves the app, LiveStore sync on /sync through a Durable Object,
 *   and hands /api/* to ChatApi over a service binding.
 *
 * Dev:     pnpm dev        (alchemy dev: Vite + both Workers in local workerd, state in .alchemy/)
 * Deploy:  pnpm deploy     (needs CLOUDFLARE_API_TOKEN and ALCHEMY_PASSWORD)
 * Destroy: pnpm destroy
 *
 * ChatApi reads its settings with Effect Config; see docs/features/chat.md#configuration.
 */
import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Effect from "effect/Effect"
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
      compatibility: { date: "2026-10-01", flags: ["nodejs_compat", "enable_request_signal"] },
      // The Worker answers /api/* and /sync; every other path is the single-page app.
      assets: { notFoundHandling: "single-page-application", runWorkerFirst: ["/api/*", "/sync*"] },
      env: { SYNC_BACKEND_DO: Cloudflare.DurableObject("SyncBackendDO"), CHAT_API: chatApi },
    })
    return { url: site.url }
  }),
)
