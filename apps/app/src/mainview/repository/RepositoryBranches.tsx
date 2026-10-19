/** Read-only repository branches; only authoritative names, heads and default flags are projected. */
import { useMemo, useSyncExternalStore } from "react"
import { hrefFor } from "../RepositoryRouter"
import { listRepositoryBranches } from "../runtime/RepositoryReadsClient"
import { loadRuntimeApplicationClient } from "../runtime/ApplicationTransport"
import { createHistoryRead } from "./RepositoryHistoryRead"
import "./repository-history.css"

export function RepositoryBranches({repo,scope,loadClient=loadRuntimeApplicationClient}:{repo:string;scope?:string;loadClient?:typeof loadRuntimeApplicationClient}) {
 const reader=useMemo(()=>createHistoryRead(async signal=>{
  const [owner,name]=repo.split("/") as [string,string]
  const client=await loadClient()
  const items: Array<Awaited<ReturnType<typeof listRepositoryBranches>>["items"][number]>=[]
  const seen=new Set<string>();let cursor:string|undefined
  do {
   const page=await listRepositoryBranches(client,owner,name,{cursor,signal})
   items.push(...page.items);cursor=page.next_cursor
   if(cursor && seen.has(cursor))throw Error("Repeated branch cursor")
   if(cursor)seen.add(cursor)
  } while(cursor && !signal.aborted)
  return {value:items.sort((a,b)=>Number(b.is_default)-Number(a.is_default)||a.name.localeCompare(b.name))}
 },"The repository host didn't return the branch list."),[repo,scope,loadClient])
 const read=useSyncExternalStore(reader.subscribe,reader.getSnapshot,reader.getSnapshot)
 return <section className="repo-history-page" data-keyboard-pane="Branches" aria-label="Branches"><div className="repo-history-toolbar"><h1>Branches</h1></div>
  {read.phase==="loading"?<p role="status">Loading…</p>:read.phase==="failed"?<div role="alert"><h2>Couldn't load branches.</h2><p>{read.error}</p><button className="repo-ui-btn" onClick={reader.retry}>Retry</button></div>:!read.value?.length?<p>No branches found.</p>:<div className="repo-history-box">{read.value.map(branch=><div className="repo-history-commit-row" key={branch.name}><div className="repo-history-commit-main"><a data-branch className="repo-history-commit-title" href={hrefFor({repo,subject:{kind:"tree",location:branch.name.split("/").map(encodeURIComponent).join("/")}})}>{branch.name}</a>{branch.is_default&&<span className="repo-history-muted">Default</span>}</div><a className="repo-history-sha" href={hrefFor({repo,subject:{kind:"commit",sha:branch.head}})}>{branch.head.slice(0,7)}</a></div>)}</div>}
 </section>
}
