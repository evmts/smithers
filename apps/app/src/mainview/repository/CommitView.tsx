import { Suspense } from "react"
import { Markdown } from "@smthrs/ui"
import { hrefFor } from "../RepositoryRouter"
import { DiffSurface } from "../ViewModules"
import { ReadState } from "./CommitsView"
import { useHistoryRead, type HistoryReads } from "./HistoryReads"

export function CommitView({ repo, sha, reads }: { repo: string; sha: string; reads: HistoryReads }) {
  const result = useHistoryRead(reads, JSON.stringify([repo, "commit", sha]), signal => reads.commit(repo, sha, signal))
  const item = result.value
  if (result.status === 404) return <section className="repo-history-page repo-history-stack">
    <h2>Commit not found.</h2><p className="repo-history-sha">{sha}</p>
    <a href={hrefFor({ repo, subject: { kind: "commits" } })}>Open commits</a>
  </section>
  if (result.state !== "ready" || !item) return <ReadState {...result}/>
  return <section className="repo-history-page repo-history-stack" aria-label="Commit">
    <header className="repo-history-commit-header">
      <div><div className="repo-history-eyebrow">Commit {item.short_sha}</div><h1>{item.title}</h1></div>
      <a className="repo-ui-btn repo-ui-btn-primary" href={hrefFor({ repo, subject: { kind: "tree", location: item.sha } })}>Browse files</a>
    </header>
    {item.body && <Markdown content={item.body}/>}
    <div className="repo-ui-box">
      <div className="repo-ui-row repo-history-author-row"><span>{item.author || "Unavailable"}</span><time dateTime={item.committed_at}>{new Date(item.committed_at).toLocaleString()}</time></div>
      <dl className="repo-history-facts">
        <div><dt>Commit</dt><dd className="repo-history-sha">{item.sha}</dd></div>
        <div><dt>{item.parents.length === 1 ? "Parent" : "Parents"}</dt><dd>{item.parents.length ? item.parents.map(parent =>
          <a key={parent} className="repo-history-sha" href={hrefFor({ repo, subject: { kind: "commit", sha: parent } })}>{parent.slice(0, 7)}</a>) : "Initial commit"}</dd></div>
      </dl>
    </div>
    <div className="repo-history-diff-heading"><h2>{item.files.length} changed {item.files.length === 1 ? "file" : "files"}</h2>
      <span className="repo-history-add">+{item.files.reduce((total, file) => total + file.additions, 0)}</span>
      <span className="repo-history-del">−{item.files.reduce((total, file) => total + file.deletions, 0)}</span>
    </div>
    <div className="repo-ui-box">{item.files.map(file => {
      // The read contract gains patch bytes upstream; summaries remain useful until then.
      const patch = "patch" in file && typeof file.patch === "string" ? file.patch : undefined
      return <section key={file.path} aria-label={file.path}>
        <div className="repo-ui-row"><a className="repo-history-path" href={hrefFor({ repo, subject: { kind: "commits", location: `${item.sha}/${file.path.split("/").map(encodeURIComponent).join("/")}` } })}>{file.path}</a>
          <span>{file.status}</span><span className="repo-history-add">+{file.additions}</span><span className="repo-history-del">−{file.deletions}</span></div>
        {patch && <Suspense fallback={<p role="status">Loading…</p>}><DiffSurface path={file.path} patch={patch}/></Suspense>}
      </section>
    })}</div>
  </section>
}
