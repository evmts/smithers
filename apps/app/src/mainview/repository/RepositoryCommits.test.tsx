import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, afterEach, expect, test } from "bun:test"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import type { ApplicationClient } from "../runtime/ApplicationClient"
import { repositoryRouter } from "../RepositoryRouter"
import { RepositoryCommits } from "./RepositoryCommits"
GlobalRegistrator.register({ url: "https://smithers.sh/alice/demo/commits/main" })
afterEach(() => { repositoryRouter().dispose(); window.history.replaceState(null,"","/alice/demo/commits/main") })
afterAll(async () => { await settle(); await GlobalRegistrator.unregister() })
const commit = { sha: "a".repeat(40), short_sha: "aaaaaaa", title: "Real title", body: "", author: "Ada", authored_at: "2026-10-18T10:00:00Z", committed_at: "2026-10-18T10:00:00Z", parents: [] }
const settle = async () => { for(let i=0;i<6;i++) await new Promise(r => setTimeout(r,0)) }
test("renders history, passes ref/path and cursor, and links immutable commits", async () => {
 window.history.replaceState(null,"","/alice/demo/commits/main/src/a.ts")
 const paths: string[] = []
 const client = { request: async (path: string) => { paths.push(path); return { items: [commit], ...(paths.length === 1 ? { next_cursor: "opaque" } : {}) } } } as unknown as ApplicationClient
 const host = document.createElement("div"); document.body.append(host); const root = createRoot(host)
 flushSync(() => root.render(<RepositoryCommits repo="alice/demo" location="main/src/a.ts" refs={["main"]} loadClient={async () => client}/>))
 expect(host.textContent).toContain("Loading")
 await settle()
 expect(host.textContent).toContain("Real title"); expect(host.textContent).toContain("Ada")
 expect(host.querySelector('a')?.getAttribute("href")).toBe("/alice/demo/commit/"+commit.sha)
 expect(paths[0]).toContain("ref=main&path=src%2Fa.ts")
 flushSync(() => (Array.from(host.querySelectorAll("a")).find(b => b.textContent === "Older")!).click())
 await settle(); expect(paths[1]).toContain("cursor=opaque"); expect(window.location.search).toContain("cursor=opaque"); expect(window.location.pathname).toBe("/alice/demo/commits/main/src/a.ts")
 flushSync(() => root.render(<RepositoryCommits key="reload" repo="alice/demo" location="main/src/a.ts" refs={["main"]} loadClient={async () => client}/>)); await settle()
 expect(paths[2]).toContain("cursor=opaque")
 window.history.back(); await settle(); expect(window.location.search).toBe("")
 expect(paths.at(-1)).not.toContain("cursor=")
 flushSync(() => root.unmount())
})
test("failed read remains distinct from empty and retry recovers", async () => {
 let calls=0
 const client = { request: async () => { if (++calls===1) throw Error("private diagnostic"); return {items: []} } } as unknown as ApplicationClient
 const host=document.createElement("div"); const root=createRoot(host)
 flushSync(() => root.render(<RepositoryCommits repo="alice/demo" refs={["main"]} loadClient={async () => client}/>)); await settle()
 expect(host.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load commits")
 expect(host.textContent).not.toContain("private diagnostic")
 flushSync(() => host.querySelector("button")!.click()); await settle()
 expect(host.textContent).toContain("No commits found."); expect(calls).toBe(2)
 flushSync(() => root.unmount())
})
test("history links use the shared router without reloading", async () => {
 const {createRepositoryRouter}=await import("../RepositoryRouter")
 window.history.replaceState(null,"","/alice/demo/commits/main")
 const host=document.createElement("div");document.body.append(host)
 const router=createRepositoryRouter(window,host)
 const root=createRoot(host)
 const client={request:async()=>({items:[commit]})} as unknown as ApplicationClient
 flushSync(()=>root.render(<RepositoryCommits repo="alice/demo" refs={["main"]} loadClient={async()=>client}/>));await settle()
 host.querySelector("a")!.click()
 expect(router.getSnapshot()?.subject).toEqual({kind:"commit",sha:commit.sha})
 flushSync(()=>root.unmount());router.dispose();host.remove()
})
test("replacing a ref rejects an unresolved earlier response", async () => {
 let finish: (v: unknown)=>void=()=>{}
 const client={request:async(path:string)=>path.includes("ref=old")?new Promise(r=>{finish=r}):{items:[]}} as unknown as ApplicationClient
 const loadClient=async()=>client
 const host=document.createElement("div");const root=createRoot(host)
 flushSync(()=>root.render(<RepositoryCommits repo="alice/demo" location="old" refs={["old","main"]} loadClient={loadClient}/>));await settle()
 flushSync(()=>root.render(<RepositoryCommits repo="alice/demo" location="main" refs={["old","main"]} loadClient={loadClient}/>));await settle()
 finish({items:[commit]});await settle()
 expect(host.textContent).toContain("No commits found.");expect(host.textContent).not.toContain(commit.title)
 flushSync(()=>root.unmount())
})

test("authoritative longest ref wins and unknown ref differs from empty",async()=>{
 const paths:string[]=[]
 const client={request:async(path:string)=>{paths.push(path);return {items:[]}}} as unknown as ApplicationClient
 const loadClient=async()=>client, loadRefs=async()=>({names:["feature","feature/topic"]})
 const host=document.createElement("div");const root=createRoot(host)
 flushSync(()=>root.render(<RepositoryCommits repo="alice/demo" location="feature/topic/src/a.ts" refs={["feature"]} loadRefs={loadRefs} loadClient={loadClient}/>));await settle()
 expect(paths[0]).toContain("ref=feature%2Ftopic&path=src%2Fa.ts")
 flushSync(()=>root.render(<RepositoryCommits repo="alice/demo" location="missing" refs={[]} loadRefs={loadRefs} loadClient={loadClient}/>));await settle()
 expect(host.textContent).toContain("Reference unavailable.");expect(paths).toHaveLength(1)
 flushSync(()=>root.unmount())
})
