/** One immutable Git commit, using the shared diff surface when patch bytes are available. */
import { lazy, Suspense, useMemo, useSyncExternalStore } from "react"
import { hrefFor } from "../RepositoryRouter"
import { getRepositoryCommit } from "../runtime/RepositoryReadsClient"
import { loadRuntimeApplicationClient } from "../runtime/ApplicationTransport"
import { createHistoryRead } from "./RepositoryHistoryRead"
import "./repository-history.css"
const DiffSurface=lazy(()=>import("../cards/DiffSurface").then(module=>({default:module.DiffSurface})))

export function RepositoryCommit({repo,sha,scope,loadClient=loadRuntimeApplicationClient}:{repo:string;sha:string;scope?:string;loadClient?:typeof loadRuntimeApplicationClient}) {
 const reader=useMemo(()=>createHistoryRead(async signal=>{
  const [owner,name]=repo.split("/") as [string,string]
  return {value:await getRepositoryCommit(await loadClient(),owner,name,sha,signal)}
 },"The repository host didn't return the commit or its diff."),[repo,sha,scope,loadClient])
 const read=useSyncExternalStore(reader.subscribe,reader.getSnapshot,reader.getSnapshot)
 const item=read.value
 const link=(sha:string)=>hrefFor({repo,subject:{kind:"commit",sha}})
 return <section className="repo-history-page" data-keyboard-pane="Commit" aria-label="Commit">
  {read.phase === "loading" ? <p role="status">Loading…</p> : read.phase === "failed" && read.status === 404 ? <div><h2>Commit not found.</h2><code>{sha}</code><p><a href={hrefFor({repo,subject:{kind:"commits"}})}>Open commits</a></p></div> : read.phase === "failed" ? <div role="alert"><h2>Couldn't load this commit.</h2><p>{read.error}</p><button className="repo-ui-btn" onClick={reader.retry}>Retry</button></div> : item && <div className="repo-history-stack">
   <header className="repo-history-commit-header"><div><span className="repo-history-muted">Commit <code>{item.short_sha}</code></span><h1>{item.title}</h1></div><a className="repo-ui-btn" href={hrefFor({repo,subject:{kind:"tree",location:item.sha}})}>Browse files</a></header>
   {item.body && <p className="repo-history-message">{item.body}</p>}
   <div className="repo-history-meta"><span>{item.author || "unavailable"}</span><span>committed <time dateTime={item.committed_at}>{item.committed_at}</time></span></div>
   <div className="repo-history-identity"><code>{item.sha}</code><button className="repo-ui-btn" aria-label="Copy SHA" onClick={()=>void navigator.clipboard.writeText(item.sha)}>Copy SHA</button></div>
   {item.parents.length>0 && <nav className="repo-history-meta" aria-label="Parents"><span>{item.parents.length === 1 ? "Parent" : "Parents"}</span>{item.parents.map(parent=><a className="repo-history-sha" key={parent} href={link(parent)}>{parent.slice(0,7)}</a>)}</nav>}
   <div className="repo-history-toolbar"><h2>{item.files.length} {item.files.length === 1 ? "file" : "files"} changed</h2><span className="repo-history-additions">+{item.files.reduce((n,file)=>n+file.additions,0)}</span><span className="repo-history-deletions">−{item.files.reduce((n,file)=>n+file.deletions,0)}</span></div>
   <div className="repo-history-stack">{item.files.map(file=><section key={file.path} className="repo-history-box" aria-label={`${file.path} changes`}><header className="repo-history-file-header"><span>{file.from && <>{file.from} → </>}{file.path}</span><span className="repo-history-muted">{file.status}</span><span className="repo-history-additions">+{file.additions}</span><span className="repo-history-deletions">−{file.deletions}</span></header>{"patch" in file && typeof file.patch === "string" && file.patch && <Suspense fallback={<p role="status">Loading…</p>}><DiffSurface path={file.path} oldPath={file.from} patch={file.patch}/></Suspense>}</section>)}</div>
  </div>}
 </section>
}
