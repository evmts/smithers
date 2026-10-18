import { afterEach, expect, test } from "bun:test"
import edge from "./edge"

const servers: Array<ReturnType<typeof Bun.serve>> = []
afterEach(() => { for (const server of servers.splice(0)) server.stop(true) })
test("composed edge resolves a site, serves exact files, selects the repo app and forwards API", async () => {
  const seen: string[] = []
  const backend = Bun.serve({hostname:"127.0.0.1",port:49400 + Math.floor(Math.random()*2000),fetch(request) {
    const url = new URL(request.url)
    seen.push(url.pathname)
    if (url.pathname === "/api/sites/resolve") return url.searchParams.get("host") === "manual.smithers.sh"
      ? Response.json({repository:"first/manual",appPrefix:"/repo/",version:"v1"}) : new Response(null,{status:421})
    if (url.pathname === "/api/sites/content") {
      if (request.headers.get("x-forwarded-host") !== url.searchParams.get("host")) return new Response(null, {status:404})
      const files: Record<string,string> = {"/":"<h1>Static</h1>","/spec/a.md":"# A","/setup.md":"setup","/llms.txt":"index"}
      const body = files[url.searchParams.get("path")!]
      return body === undefined ? new Response(null,{status:404}) : new Response(body,{headers:{"content-type":"text/plain"}})
    }
    return Response.json({source:"backend",cookie:request.headers.get("cookie")})
  }})
  servers.push(backend)
  const env = {SMITHERS_BACKEND_ORIGIN:backend.url.origin,ASSETS:{fetch:async (request:Request) => new Response(new URL(request.url).pathname.startsWith("/__smithers/") ? "bundle" : "<!doctype html><head><title>App</title></head><body>app</body>",{headers:{"content-type":"text/html"}})}}
  for (const [path,body] of [["/","<h1>Static</h1>"],["/spec/a.md","# A"],["/setup.md","setup"],["/llms.txt","index"]]) expect(await (await edge.fetch(new Request(`https://manual.smithers.sh${path}`, {headers:{"x-forwarded-host":"control.test"}}),env)).text()).toBe(body)
  for (const path of ["/repo/","/not-published"]) {
    const response = await edge.fetch(new Request(`https://manual.smithers.sh${path}`, {headers:{"x-forwarded-host":"control.test"}}),env)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('name="smithers-repository-site" content="{&quot;repository&quot;:&quot;first/manual&quot;')
  }
  expect(await (await edge.fetch(new Request("https://manual.smithers.sh/__smithers/app.js"),env)).text()).toBe("bundle")
  const api = await edge.fetch(new Request("https://manual.smithers.sh/api/user",{headers:{cookie:"__Host-smithers_session=own"}}),env)
  expect(await api.json()).toEqual({source:"backend",cookie:"__Host-smithers_session=own"})
  for (const host of ["wrong.example","pending.smithers.sh"]) for (const path of ["/","/repo/","/api/user"])
    expect((await edge.fetch(new Request(`https://${host}${path}`),env)).status).toBe(421)
  expect(seen).toContain("/api/sites/content")
})

test("disabled backend hosting refuses content hosts before assets or API forwarding", async () => {
  const seen: string[] = []
  const backend = Bun.serve({ hostname: "127.0.0.1", port: 49400 + Math.floor(Math.random() * 2000), fetch(request) {
    seen.push(new URL(request.url).pathname)
    return Response.json({ code: "site_unavailable" }, { status: 503 })
  } })
  servers.push(backend)
  const env = { SMITHERS_BACKEND_ORIGIN: backend.url.origin, ASSETS: { fetch: async () => { throw new Error("Disabled host reached app assets") } } }
  for (const host of ["manual.smithers.sh", "custom.example"]) for (const path of ["/", "/repo/", "/api/user", "/api/auth/site/start"]) {
    const response = await edge.fetch(new Request(`https://${host}${path}`), env)
    expect(response.status).toBe(421)
    expect(response.headers.has("set-cookie")).toBe(false)
  }
  expect(seen).toEqual(Array(8).fill("/api/sites/resolve"))
})
