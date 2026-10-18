import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, expect, test } from "bun:test"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import type { ApplicationClient } from "../runtime/ApplicationClient"
import { RepositoryBranches } from "./RepositoryBranches"
GlobalRegistrator.register({url:"https://smithers.sh/alpha/one/branches"})
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setTimeout(r,0))}
afterAll(async()=>{await settle();await GlobalRegistrator.unregister()})
const sha="a".repeat(40)
const branch=(name:string,is_default=false)=>({name,is_default,head:sha,title:"A change",author:"Ada",updated:"2026-10-18T10:00:00Z"})
test("deep branches read lists default first across pages and routes names and heads",async()=>{
 const paths:string[]=[]
 const client={request:async(path:string)=>{paths.push(path);return paths.length===1?{items:[branch("feature/a")],next_cursor:"opaque"}:{items:[branch("main",true)]}}} as unknown as ApplicationClient
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host)
 const {createRepositoryRouter}=await import("../RepositoryRouter");const router=createRepositoryRouter(window,host)
 flushSync(()=>root.render(<RepositoryBranches repo="alpha/one" loadClient={async()=>client}/>));expect(host.textContent).toContain("Loading");await settle()
 expect(paths[1]).toContain("cursor=opaque")
 const links=host.querySelectorAll<HTMLAnchorElement>('a[data-branch]');expect(links[0]?.textContent).toBe("main");expect(links[1]?.textContent).toBe("feature/a")
 expect(host.textContent).not.toContain("2026-10-18");expect(host.textContent).not.toContain("New branch")
 links[1]!.click();expect(router.getSnapshot()?.subject).toEqual({kind:"tree",location:"feature/a"})
 flushSync(()=>root.unmount());router.dispose();host.remove()
})
test("failed branches retry does not claim an empty list",async()=>{
 let count=0;const client={request:async()=>{if(++count===1)throw Error("private");return {items:[]}}} as unknown as ApplicationClient
 const host=document.createElement("div");const root=createRoot(host)
 flushSync(()=>root.render(<RepositoryBranches repo="alpha/one" loadClient={async()=>client}/>));await settle()
 expect(host.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load branches")
 flushSync(()=>host.querySelector("button")!.click());await settle();expect(host.textContent).toContain("No branches found.")
 flushSync(()=>root.unmount())
})
