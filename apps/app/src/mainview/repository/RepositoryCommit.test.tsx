import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, expect, test } from "bun:test"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import type { ApplicationClient } from "../runtime/ApplicationClient"
import { RepositoryCommit } from "./RepositoryCommit"
GlobalRegistrator.register({url:"https://smithers.sh/alpha/one/commit/"+"a".repeat(40)})
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setTimeout(r,0))}
afterAll(async()=>{await settle();await GlobalRegistrator.unregister()})
const sha="a".repeat(40), parent="b".repeat(40)
const detail={sha,short_sha:"aaaaaaa",title:"A real change",body:"Why it changed.",author:"Ada",authored_at:"2026-10-18T10:00:00Z",committed_at:"2026-10-18T11:00:00Z",parents:[parent],files:[{path:"src/next.ts",from:"src/old.ts",status:"renamed",additions:7,deletions:2}]}
test("deep commit renders real metadata, parent links and file summary",async()=>{
 const calls:string[]=[]
 const client={request:async(path:string)=>{calls.push(path);return detail}} as unknown as ApplicationClient
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host)
 const {createRepositoryRouter}=await import("../RepositoryRouter");const router=createRepositoryRouter(window,host)
 flushSync(()=>root.render(<RepositoryCommit repo="alpha/one" sha={sha} loadClient={async()=>client}/>));expect(host.textContent).toContain("Loading");await settle()
 for(const text of [detail.title,detail.body,detail.author,"src/old.ts","src/next.ts","+7","−2"])expect(host.textContent).toContain(text)
 expect(host.textContent).toContain("1 file changed")
 expect(calls).toEqual([`/api/repos/alpha/one/commits/${sha}`])
 expect(host.textContent).not.toContain("Verified")
 host.querySelector<HTMLAnchorElement>(`a[href$="${parent}"]`)!.click();expect(router.getSnapshot()?.subject).toEqual({kind:"commit",sha:parent})
 flushSync(()=>root.unmount());router.dispose();host.remove()
})
test("commit error retries and an empty diff remains valid",async()=>{
 let count=0;const client={request:async()=>{if(++count===1)throw Error("private");return {...detail,files:[],parents:[]}}} as unknown as ApplicationClient
 const host=document.createElement("div");const root=createRoot(host)
 flushSync(()=>root.render(<RepositoryCommit repo="alpha/one" sha={sha} loadClient={async()=>client}/>));await settle()
 expect(host.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load this commit")
 flushSync(()=>host.querySelector("button")!.click());await settle();expect(host.textContent).toContain("0 files changed");expect(host.textContent).not.toContain("private")
 flushSync(()=>root.unmount())
})

test("missing commit names requested SHA and offers history",async()=>{
 const {ApplicationClientError}=await import("../runtime/ApplicationClient")
 const client={request:async()=>{throw new ApplicationClientError("api","Missing",404)}} as unknown as ApplicationClient
 const host=document.createElement("div");const root=createRoot(host)
 flushSync(()=>root.render(<RepositoryCommit repo="alpha/one" sha={sha} loadClient={async()=>client}/>));await settle()
 expect(host.textContent).toContain("Commit not found.");expect(host.textContent).toContain(sha)
 expect(host.querySelector("a")?.getAttribute("href")).toBe("/alpha/one/commits")
 flushSync(()=>root.unmount())
})
