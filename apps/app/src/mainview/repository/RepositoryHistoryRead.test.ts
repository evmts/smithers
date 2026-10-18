import { expect, test } from "bun:test"
import { ApplicationClientError } from "../runtime/ApplicationClient"
import { createHistoryRead } from "./RepositoryHistoryRead"
const settle=async()=>{await new Promise(r=>setTimeout(r,0))}
test("duplicate subscribers share the request; disposal aborts and rejects late data",async()=>{
 let count=0;let signal:AbortSignal|undefined;let finish:(v:{value:string})=>void=()=>{}
 const reader=createHistoryRead<string>((s)=>{count++;signal=s;return new Promise(r=>{finish=r})},"Unavailable")
 const a=reader.subscribe(()=>{}),b=reader.subscribe(()=>{})
 expect(count).toBe(1);a();expect(signal?.aborted).toBe(false);b();expect(signal?.aborted).toBe(true)
 finish({value:"stale"});await settle();expect(reader.getSnapshot().value).toBeUndefined()
})
test("retry replaces the failure and supersedes an unresolved request",async()=>{
 let calls=0
 const reader=createHistoryRead(async()=>{if(++calls===1)throw Error("fail");return {value:"ready",cursor:"opaque"}},"Unavailable")
 const stop=reader.subscribe(()=>{});await settle();expect(reader.getSnapshot().phase).toBe("failed")
 reader.retry();await settle();expect(reader.getSnapshot().value).toBe("ready");expect(reader.getSnapshot().cursor).toBe("opaque");expect(calls).toBe(2);stop()
})
for(const [code,status] of [["unauthenticated",401],["forbidden",403],["api",404],["rate-limited",429]] as const){
 test(`retains ${status} refusal policy`,async()=>{
  const error=new ApplicationClientError(code,`Read refused (${status})`,status)
  const reader=createHistoryRead(async()=>{throw error},"Unavailable")
  const stop=reader.subscribe(()=>{});await settle()
  expect(reader.getSnapshot().phase).toBe("failed");expect(reader.getSnapshot().error).toContain(String(status));stop()
 })
}
