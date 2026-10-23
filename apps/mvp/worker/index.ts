// The site Worker serves origin-aware HTML and forwards API and docs requests.
import { DOCS_SITE_FOLDERS } from "../src/pwa.ts"

interface Env {
  readonly ASSETS: Fetcher
  readonly CHAT_API: Fetcher
}

export default {
  fetch: async (request, env) => {
    const url = new URL(request.url)
    if (url.pathname.startsWith("/api/")) return env.CHAT_API.fetch(request)
    if (DOCS_SITE_FOLDERS.includes(url.pathname)) {
      url.pathname = `${url.pathname}/`
      return Response.redirect(url.toString(), 301)
    }
    const response = await env.ASSETS.fetch(request)
    if (response.status !== 200 || !response.headers.get("content-type")?.startsWith("text/html")) return response
    // Asset validators and lengths describe the stored shell, not this origin-specific representation.
    const headers = new Headers(response.headers)
    headers.delete("content-length")
    headers.delete("etag")
    return new Response((await response.text()).replaceAll("__SMITHERS_ORIGIN__", url.origin), {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
} satisfies ExportedHandler<Env>
