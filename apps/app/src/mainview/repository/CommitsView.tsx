import { hrefFor, navigate } from "../RepositoryRouter"
import { useHistoryRead, type HistoryReads } from "./HistoryReads"
import "./history.css"

export function ReadState({ state, error, retry }: { state: string; error?: string; retry: () => void }) {
  return state === "loading" ? <p role="status">Loading…</p> : state === "error" ?
    <div role="alert"><p>{error ?? "Unavailable"}</p><button className="repo-ui-btn" onClick={retry}>Retry</button></div> : null
}

export function CommitsView({ repo, reads, reference, path, cursor, onPage, refs = [] }: {
  repo: string; reads: HistoryReads; reference?: string; path?: string; cursor?: string
  onPage?: (cursor: string) => void; refs?: readonly string[]
}) {
  const result = useHistoryRead(reads, JSON.stringify([repo, "commits", reference, path, cursor]),
    () => reads.commits(repo, reference, path, cursor))
  const groups = new Map<string, NonNullable<typeof result.value>["items"]>()
  for (const item of result.value?.items ?? []) {
    const day = item.committed_at.slice(0, 10)
    groups.set(day, [...(groups.get(day) ?? []), item])
  }
  const branchLocation = (ref: string) => [ref, ...(path ? [path] : [])]
    .map(value => value.split("/").map(encodeURIComponent).join("/")).join("/")
  return <div className="repo-history-page repo-history-stack">
    <div className="repo-history-toolbar">
      {reference && <select className="repo-ui-btn" aria-label="Branch" value={reference}
        onChange={event => navigate({ repo, subject: { kind: "commits", location: branchLocation(event.target.value) } })}>
        {[...new Set([reference, ...refs])].map(ref => <option key={ref}>{ref}</option>)}
      </select>}
      <h2 className="repo-history-heading">Commits</h2>
      {path && <span className="repo-history-path">{path}</span>}
    </div>
    <ReadState {...result}/>
    {result.state === "ready" && <>
      {!result.value?.items.length ? <p>No commits found.</p> : <div className="repo-history-days">
        {[...groups].map(([day, items]) => <section className="repo-history-day" key={day}>
          <h3>{day}</h3>
          <div className="repo-ui-box">{items.map(item => <div className="repo-ui-row repo-history-commit-row" key={item.sha}>
            <div className="repo-history-commit-main">
              <a className="repo-history-commit-title" href={hrefFor({ repo, subject: { kind: "commit", sha: item.sha } })}>{item.title}</a>
              <div className="repo-history-meta"><span>{item.author || "Unavailable"}</span>
                <time dateTime={item.committed_at}>{new Date(item.committed_at).toLocaleString()}</time>
              </div>
            </div>
            <a className="repo-history-sha" href={hrefFor({ repo, subject: { kind: "commit", sha: item.sha } })}>{item.short_sha}</a>
            <a className="repo-ui-btn" aria-label={`Browse files at ${item.short_sha}`} href={hrefFor({ repo, subject: { kind: "tree", location: item.sha } })}>Browse</a>
          </div>)}</div>
        </section>)}
      </div>}
      {result.value?.next_cursor && <button className="repo-ui-btn" onClick={() => onPage?.(result.value!.next_cursor!)}>Older</button>}
    </>}
  </div>
}
