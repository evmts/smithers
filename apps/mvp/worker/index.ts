import * as SyncBackend from "@livestore/sync-cf/cf-worker"

// The site's Worker. It only wires LiveStore's sync backend, which is a plain Durable Object class,
// and hands /api/* to the Effect-native ChatApi Worker (worker/ChatApi.ts) over a service binding.
interface Env extends SyncBackend.Env {
  ASSETS: SyncBackend.CfTypes.Fetcher
  CHAT_API: SyncBackend.CfTypes.Fetcher
}

// One Durable Object per store keeps the event log and fans it out to every browser.
export class SyncBackendDO extends SyncBackend.makeDurableObject({}) { }

export default {
  fetch: (request, env, ctx) => {
    const sync = SyncBackend.matchSyncRequest(request)
    if (sync !== undefined) {
      return SyncBackend.handleSyncRequest({ request, searchParams: sync, env, ctx, syncBackendBinding: "SYNC_BACKEND_DO" })
    }
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return env.CHAT_API.fetch(request)
    }
    return env.ASSETS.fetch(request)
  },
} satisfies SyncBackend.CFWorker<Env>
