/** Live branch and path history inside the shared repository frame. */
import { Copy, Folder, GitCommitHorizontal } from "lucide-react"
import { useMemo, useSyncExternalStore } from "react"
import { resolveRefLocation } from "@smthrs/rpc/RepositorySubjectPath"
import { relativeTime } from "../cards/GithubParts"
import { hrefFor, navigate, subscribe } from "../RepositoryRouter"
import { listRepositoryCommits } from "../runtime/RepositoryReadsClient"
import { loadRuntimeApplicationClient } from "../runtime/ApplicationTransport"
import { createHistoryRead } from "./RepositoryHistoryRead"
import "./repository-history.css"

export function RepositoryCommits({ repo, location, refs, defaultRef, scope, loadRefs, loadClient = loadRuntimeApplicationClient }: {
 repo: string; location?: string; refs: ReadonlyArray<string>; defaultRef?: string; scope?: string; loadRefs?: () => Promise<{ readonly names: ReadonlyArray<string> } | { readonly error: string }>; loadClient?: typeof loadRuntimeApplicationClient
}) {
 const search = useSyncExternalStore(subscribe, () => window.location.search, () => "")
 const query = new URLSearchParams(search)
 const cursor = query.get("cursor") ?? undefined
 const previous = query.getAll("before")
 const pageHref = (cursor: string | undefined, before: string[]) => {
  const params = new URLSearchParams(search)
  params.delete("cursor"); params.delete("before")
  if (cursor) params.set("cursor", cursor)
  for (const value of before) params.append("before", value)
  const href = hrefFor({ repo, subject: { kind: "commits", ...(location ? { location } : {}) } })
  return href + (params.size ? `?${params}` : "")
 }
 const resolved = location ? resolveRefLocation(location, refs) : undefined
 const ref = resolved?.ref, path = resolved?.path
 const reader = useMemo(() => createHistoryRead(async signal => {
  const inventory = await loadRefs?.()
  if (inventory && "error" in inventory) throw new Error("Reference unavailable")
  const located = location ? resolveRefLocation(location, inventory && "names" in inventory ? inventory.names : refs) : undefined
  if (location && !located) return { value: { items: [], ref: undefined, path: undefined, unavailable: true } }
  const [owner, name] = repo.split("/") as [string, string]
  const page = await listRepositoryCommits(await loadClient(), owner, name, { ref: located?.ref ?? defaultRef, path: located?.path, cursor, signal })
  return { value: { items: page.items, unavailable: false, ref: located?.ref ?? defaultRef, path: located?.path }, cursor: page.next_cursor }
 }, "The repository host didn't return commit history."), [repo, location, ref, path, scope, loadClient, Boolean(resolved), loadRefs, defaultRef, cursor])
 const read = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot)
 const groups = new Map<string, NonNullable<typeof read.value>["items"]>()
 for (const item of read.value?.items ?? []) { const day = item.committed_at.slice(0, 10); groups.set(day, [...(groups.get(day) ?? []), item]) }
 return <section className="repo-history-page" data-keyboard-pane="Commits" aria-label="Commit history">
  <div className="repo-history-toolbar">{refs.length > 0 && <select aria-label="Switch branches" value={read.value?.ref ?? ref ?? defaultRef ?? refs[0]} onChange={event => navigate({ repo, subject: { kind: "commits", location: `${event.target.value.split("/").map(encodeURIComponent).join("/")}${(read.value?.path ?? path) ? `/${(read.value?.path ?? path)!.split("/").map(encodeURIComponent).join("/")}` : ""}` } })}>{refs.map(name => <option key={name}>{name}</option>)}</select>}<h1>{(read.value?.path ?? path) ? `History for ${read.value?.path ?? path}` : "Commits"}</h1></div>
  {read.phase === "loading" ? <p role="status">Loading…</p> : read.phase === "failed" ? <div role="alert"><h2>Couldn't load commits.</h2><p>{read.error}</p><button className="repo-ui-btn" onClick={reader.retry}>Retry</button></div> : read.value?.unavailable ? <p>Reference unavailable.</p> : !read.value?.items.length ? <p>No commits found.</p> : <div className="repo-history-days">{[...groups].map(([day, items]) => <section key={day} className="repo-history-day"><h2><GitCommitHorizontal size={16} aria-hidden="true"/>Commits on {new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</h2><div className="repo-ui-box repo-history-box">{items.map(item => <div className="repo-ui-row repo-history-commit-row" key={item.sha}><div className="repo-history-commit-main"><a className="repo-history-commit-title" href={hrefFor({ repo, subject: { kind: "commit", sha: item.sha } })}>{item.title || "unavailable"}</a><div className="repo-history-meta"><span>{item.author || "unavailable"}</span><span>committed <time dateTime={item.committed_at} title={item.committed_at}>{relativeTime(item.committed_at)}</time></span></div></div><div className="repo-history-commit-actions"><a className="repo-history-sha" href={hrefFor({ repo, subject: { kind: "commit", sha: item.sha } })}>{item.short_sha}</a><button className="repo-ui-btn" aria-label={`Copy SHA ${item.short_sha}`} onClick={() => void navigator.clipboard.writeText(item.sha)}><Copy size={14} aria-hidden="true"/></button><a href={hrefFor({ repo, subject: { kind: "tree", location: item.sha } })} aria-label={`Browse files at ${item.short_sha}`}><Folder size={16} aria-hidden="true"/></a></div></div>)}</div></section>)}</div>}
  {read.phase === "ready" && (previous.length > 0 || read.cursor) && <nav className="repo-history-pagination" aria-label="Commit pages">{previous.length ? <a className="repo-ui-btn" href={pageHref(previous.at(-1) || undefined, previous.slice(0, -1))}>Newer</a> : <button className="repo-ui-btn" disabled>Newer</button>}{read.cursor ? <a className="repo-ui-btn" href={pageHref(read.cursor, [...previous, cursor ?? ""])}>Older</a> : <button className="repo-ui-btn" disabled>Older</button>}</nav>}
 </section>
}
