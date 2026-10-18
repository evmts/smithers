/* BranchPicker currentRef defaults to route :ref or the default branch; onChange overrides navigation.
 * Default navigation rewrites tree/blob/blame/commits refs, and goes to tree/:ref from the repo root. */
import { useEffect, useId, useRef, useState } from "react"
import { Icon } from "../../app/lib"
import { navigate, useLocation } from "../../core/router"
import { branches, tags, repo, to } from "../fixtures"
import { registerSlash } from "../frame"
export const BranchPicker = ({ currentRef, onChange }: { currentRef?: string; onChange?: (ref: string) => void }) => {
  const filterId = useId()
  const location = useLocation()
  const match = location.match(/\/(?:tree|blob|blame|commits)\/([^/?]+)/)
  const selected = currentRef ?? (match ? decodeURIComponent(match[1]) : repo.defaultBranch)
  const [filter, setFilter] = useState("")
  const [kind, setKind] = useState<"branches" | "tags">("branches")
  const menu = useRef<HTMLDetailsElement>(null)
  const choose = (ref: string, close: () => void) => {
    close()
    if (onChange) onChange(ref)
    else if (match) {
      const [path, raw] = location.replace(/\/(tree|blob|blame|commits)\/[^/?]+/, `/$1/${encodeURIComponent(ref)}`).split("?")
      const query = new URLSearchParams(raw)
      query.delete("prior") // A parent-commit blame request does not apply to a newly selected branch.
      navigate(`${path}${query.size ? `?${query}` : ""}`)
    }
    else navigate(to(`tree/${encodeURIComponent(ref)}`))
  }
  useEffect(() => {
    const offSwitch = registerSlash("branch.switch", {
      purpose: "Switch branch or tag", access: "public", confirm: false,
      fields: [{ name: "ref", label: "Branch or tag", options: [...branches, ...tags].map(item => item.name) }],
      run: ({ ref }, { closeAsk }) => { choose(ref, closeAsk) }
    })
    const offList = registerSlash("ref.list", {
      purpose: "Choose branches or tags", access: "public", confirm: false,
      fields: [{ name: "kind", label: "References", options: ["branches", "tags"] }],
      run: ({ kind: next }, { closeAsk }) => {
        setKind(next as "branches" | "tags")
        closeAsk()
        if (menu.current) { menu.current.open = true; menu.current.querySelector("input")?.focus() }
      }
    })
    return () => { offSwitch(); offList() }
  }, [location, currentRef, onChange])
  return <details ref={menu} className="repo-ui-dropdown"><summary className="repo-ui-btn" title="/branch.switch"><Icon name="change" /><span className="repo-ui-branch-label" title={selected}>{selected}</span><Icon name="chevron-down" size={13}/></summary><div className="repo-ui-menu repo-ui-branch-menu"><label className="repo-ui-sr" htmlFor={filterId}>Filter branches and tags</label><input id={filterId} className="repo-ui-input" placeholder="Find a branch or tag…" value={filter} onChange={event => setFilter(event.target.value)} /><div className="repo-ui-actions">{(["branches", "tags"] as const).map(value => <button key={value} className="repo-ui-btn repo-ui-btn-quiet" aria-pressed={kind === value} title={`/ref.list ${value}`} onClick={() => setKind(value)}>{value === "branches" ? "Branches" : "Tags"}</button>)}</div><div className="repo-ui-menu-scroll">{(kind === "branches" ? branches : tags).filter(item => item.name.toLowerCase().includes(filter.toLowerCase())).map(item => <button key={item.name} className="repo-ui-menu-item" title={`/branch.switch ${item.name}`} onClick={event => choose(item.name, () => event.currentTarget.closest("details")?.removeAttribute("open"))}><span>{item.name}</span>{selected === item.name && <Icon name="check" size={14}/>}</button>)}{!(kind === "branches" ? branches : tags).some(item => item.name.toLowerCase().includes(filter.toLowerCase())) && <p className="repo-ui-muted">No {kind} found.</p>}</div></div></details>
}
