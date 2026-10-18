import { useSyncExternalStore } from "react"
import { resolveRefLocation } from "@smthrs/rpc/RepositorySubjectPath"
import { getSnapshot, subscribe } from "../RepositoryRouter"
import { loadRuntimeApplicationClient } from "../runtime/ApplicationTransport"
import { createHistoryReads, useHistoryRead, type HistoryReads } from "./HistoryReads"
import { CommitView } from "./CommitView"
import { CommitsView, ReadState } from "./CommitsView"

export const isHistorySubject = (subject?: { kind: string }) => subject?.kind === "commits" || subject?.kind === "commit"

export const runtimeHistoryReads = createHistoryReads(async (path, init) => (await loadRuntimeApplicationClient()).request(path, init))
/** Content-slot adapter for SP-1; uses the boot router's subject subscription. */
export function HistoryRoute({ reads = runtimeHistoryReads, defaultBranch, refs = [] }: { reads?: HistoryReads; defaultBranch?: string; refs?: readonly string[] }) {
  const target = useSyncExternalStore(subscribe, getSnapshot, () => null)
  if (target?.subject?.kind === "commit") return <CommitView repo={target.repo} sha={target.subject.sha} reads={reads}/>
  if (!target || target.subject?.kind !== "commits") return null
  return <CommitsRoute repo={target.repo} location={target.subject.location} reads={reads} defaultBranch={defaultBranch} refs={refs}/>
}
function CommitsRoute({ repo, location, reads, defaultBranch, refs }: { repo: string; location?: string; reads: HistoryReads; defaultBranch?: string; refs: readonly string[] }) {
  const result = useHistoryRead(reads, `${repo}/history-refs/${location ?? ""}/${JSON.stringify(refs)}/${defaultBranch ?? ""}`, async () => {
    const rows: string[] = [...refs, ...(defaultBranch ? [defaultBranch] : [])]
    if (location === undefined) return undefined
    const located = resolveRefLocation(location, rows)
    if (located) return located
    throw Error("Branch unavailable")
  })
  if (location !== undefined && result.state !== "ready") return <ReadState {...result}/>
  const cursor = new URLSearchParams(window.location.search).get("cursor") ?? undefined
  return <CommitsView refs={refs} repo={repo} reads={reads} reference={result.value?.ref ?? defaultBranch} path={result.value?.path} cursor={cursor} onPage={next => {
    const url = new URL(window.location.href); url.searchParams.set("cursor", next)
    window.history.pushState(window.history.state, "", url)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }}/>
}
