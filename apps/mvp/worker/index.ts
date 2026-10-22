// The site's Worker: it hands /api/* to the Effect-native ChatApi Worker (worker/ChatApi.ts) over a service binding.
// Every other path is the single-page app, which the assets binding serves before this Worker runs, apart from a bare
// docs folder: on a domain the docs site's zone routes take `/docs` before it gets here, but a route path without a
// trailing `*` never matches a query, so `/docs?ref=x` arrives here and goes on as `/docs/?ref=x`, which they do take
// (docs/infrastructure.md#domain).
import { DOCS_SITE_FOLDERS } from "../src/pwa.ts"

interface Env {
  readonly ASSETS: Fetcher
  readonly CHAT_API: Fetcher
}

export default {
  fetch: (request, env) => {
    const url = new URL(request.url)
    if (url.pathname.startsWith("/api/")) return env.CHAT_API.fetch(request)
    if (DOCS_SITE_FOLDERS.includes(url.pathname)) {
      url.pathname = `${url.pathname}/`
      return Response.redirect(url.toString(), 301)
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
