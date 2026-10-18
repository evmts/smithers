// The site's Worker: it hands /api/* to the Effect-native ChatApi Worker (worker/ChatApi.ts) over a service binding.
// Every other path is the single-page app, which the assets binding serves before this Worker runs.
interface Env {
  readonly ASSETS: Fetcher
  readonly CHAT_API: Fetcher
}

export default {
  fetch: (request, env) =>
    new URL(request.url).pathname.startsWith("/api/") ? env.CHAT_API.fetch(request) : env.ASSETS.fetch(request),
} satisfies ExportedHandler<Env>
