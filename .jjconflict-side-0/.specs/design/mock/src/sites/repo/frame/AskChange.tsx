import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { still, useMock } from "../../core/mock"
import { navigate, useLocation } from "../../core/router"
import { repo } from "../fixtures"

/* The model the run record names (prod's hosted sandbox model), never a fixed agent label. */
const RUN_MODEL = "cerebras:qwen-3.8-27b"
/* The head commit the receipt names; the test ran in the agent's own sandbox (Security d-cey74a). */
const HEAD = "a3f9c2d81e47"
const sandbox = (command: string, rest: string) => <><code>{command}</code> {rest}</>

const stages = ["Admitted", "Allocating a machine", "Cloning", "Model working", "Testing", "Pull request opened"]
const progress = ["admitted", "allocating", "cloning", "model", "testing", "ready"]
const durations = ["1 s", "8 s", "3 s", "58 s", "2 s", "1 s"]
const slugSource = `/** Convert a title to a URL segment. */
export function slugify(text: string): string {
  const normalized = text
    .normalize("NFKD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .trim()

  const words = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return words
}

export function isSlug(text: string): boolean {
  return text.length > 0 && slugify(text) === text
}`
const testSource = `import { describe, expect, test } from "bun:test"
import { isSlug, slugify } from "../src/slug"

describe("slugify", () => {
  test("joins words with a hyphen", () => {
    expect(slugify("Hello World")).toBe("hello-world")
  })
  test("removes accents", () => {
    expect(slugify("Crème brûlée")).toBe("creme-brulee")
  })
  test("trims punctuation", () => {
    expect(slugify("  Hello, world!  ")).toBe("hello-world")
  })
  test("accepts empty input", () => {
    expect(slugify("")).toBe("")
  })
  test("collapses separators", () => {
    expect(slugify("one / two")).toBe("one-two")
  })
  test("recognizes a slug", () => {
    expect(isSlug("hello-world")).toBe(true)
  })
})`

export const AskChange = ({ request, initialState = "confirm", onCancel }: { request: string; initialState?: string; onCancel: () => void }) => {
  const location = useLocation()
  const { flags } = useMock()
  const query = new URLSearchParams(location.split("?")[1])
  const state = query.get("change") ?? initialState
  const [open, setOpen] = useState<number | null>(null)
  const thread = useRef<HTMLDivElement>(null)
  const zero = state === "zero-tests" || query.get("changeTests") === "zero"
  const unknown = state === "count-unknown" || query.get("changeTests") === "unknown"
  const failed = state === "tests-failed" || query.get("changeTests") === "failed"
  const skipped = state === "no-tests" || query.get("changeTests") === "skipped"
  const running = progress.includes(state) && state !== "ready"
  const active = progress.indexOf(state)
  const pr = state === "pr" || state === "merged"
  const receipt = { tested: !skipped, exit_code: failed ? 1 : 0, tests_run: skipped || unknown ? null : zero ? 0 : 33 }
  const passed = receipt.tested && receipt.exit_code === 0 && receipt.tests_run !== 0
  // Says where the test ran; never "passed" or a green mark (Security d-cey74a, contract Lane B3).
  const testing = skipped ? "Tests not run at this commit"
    : zero ? sandbox("node --test", "ran 0 tests in the agent's sandbox")
    : unknown ? sandbox("make test", `exited 0 in the agent's sandbox at ${HEAD}`)
    : sandbox("bun test", `exited ${failed ? 1 : 0} in the agent's sandbox at ${HEAD} · 33 tests`)
  const move = (next: string, diff = false) => {
    const params = new URLSearchParams(location.split("?")[1])
    params.set("ask", "change"); params.set("change", next); params.set("changeRequest", request)
    if (zero) params.set("changeTests", "zero")
    if (unknown) params.set("changeTests", "unknown")
    if (failed) params.set("changeTests", "failed")
    if (skipped) params.set("changeTests", "skipped")
    if (diff) params.set("diff", "landing-12")
    navigate(`${location.split("?")[0]}?${params}`, { replace: true })
  }
  useEffect(() => {
    if (!running || still || query.get("still") === "1") return
    const timer = setTimeout(() => move(progress[active + 1]), 1200)
    return () => clearTimeout(timer)
  }, [state, location])
  useEffect(() => { setOpen(running ? active : 4) }, [state])
  const diff = query.get("diff") === "landing-12"
  const content = document.getElementById("repo-content")
  useEffect(() => {
    if (!diff || !content) return
    content.classList.add("repo-change-show-diff")
    return () => content.classList.remove("repo-change-show-diff")
  }, [diff, content])
  useEffect(() => {
    const element = thread.current
    const conversation = element?.closest<HTMLElement>(".repo-frame-conversation")
    const composer = conversation?.parentElement?.querySelector<HTMLElement>(".repo-frame-composer")
    if (!element || !conversation || !composer) return
    const reveal = () => {
      // The conversation already ends at the composer's top edge: 12px keeps the newest card off it without over-scrolling.
      conversation.style.paddingBottom = "12px"
      conversation.scrollTop = conversation.scrollHeight
    }
    reveal()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reveal)
    observer?.observe(composer)
    return () => { observer?.disconnect(); conversation.style.removeProperty("padding-bottom") }
  }, [state, open])
  if (state === "refused" || flags.hosted === "paused") return <div className="repo-frame-confirm"><strong>Not started: no machine is free.</strong><p>Hosted machines are down for maintenance. Nothing ran and nothing was charged.</p><p>Your request stays here. Send it again later, or run Smithers on your own machine.</p><button className="repo-ui-btn" onClick={() => move("confirm")}>Send again</button></div>
  if (state === "confirm") return <div className="repo-frame-confirm repo-change-confirm">
    <strong>Start an agent on {repo.slug}?</strong><blockquote>“{request}”</blockquote>
    <p>The agent writes and tests the change. You open the pull request and merge it on GitHub.</p>
    <div className="repo-ui-actions"><button className="repo-ui-btn repo-ui-btn-primary" onClick={() => move("admitted")}>Start agent</button><button className="repo-ui-btn repo-ui-btn-quiet" onClick={onCancel}>Cancel</button></div>
  </div>
  return <div className="repo-change-thread" ref={thread}>
    <section className="repo-change-card" aria-label="Agent run">
      <header><strong>{request}</strong><span className="repo-change-chip" data-tone={running ? "live" : failed ? "failed" : zero ? "warning" : "done"}>{state === "stopped" ? "Stopped" : running ? "Running" : failed ? "Tests failed" : zero ? "No tests ran" : "Done"}</span></header>
      <div className="repo-change-meta"><span>{RUN_MODEL}</span> · <span>{running ? "started" : "finished"} just now</span> · <span>{!running && "took "}<span className="repo-change-duration">{running ? durations[active] : "1 m 12 s"}</span></span></div>
      <div>{stages.map((label, i) => {
        const tone = i === 4 && (failed || zero) ? "failed" : i === 4 && skipped ? "skipped" : i === 5 && !pr ? "pending" : running && i > active ? "pending" : running && i === active ? "live" : "done"
        const summary = ["Request recorded", "Starting a hosted machine", "Cloning maya/tinyhttp at main", "Writing src/slug.ts and its test", testing, pr ? "Pull request #37 opened on GitHub" : "Waiting for you to open a pull request"][i]
        return <div key={label} className="repo-change-stage" data-tone={tone}><button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}><i /><span>{label}</span><span className="repo-change-duration">{tone !== "pending" ? durations[i] : ""}</span><svg className="repo-change-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg></button>{open === i && <div className="repo-change-detail">{summary}</div>}</div>
      })}</div>
      {running && <footer><span>Keeps running if you close this tab.</span></footer>}
    </section>
    {state === "stopped" ? <p>Stopped. No pull request was opened.</p> : !running && <section className="repo-change-card" aria-label="Change diff">
      <header><strong>2 files changed <span className="repo-change-added">+41</span> −0</strong><button className="repo-ui-btn repo-ui-btn-quiet" onClick={() => move(state, true)}>View diff</button></header>
      <div className="repo-change-file"><code>src/slug.ts</code><span>+18</span></div><div className="repo-change-file"><code>test/slug.test.ts</code><span>+23</span></div>
      <p>{testing}</p>
      {failed && <p><span className="repo-change-failure">Tests failed (exit 1).</span> You can still open a pull request; the failure goes in its description.</p>}
      {zero && <p><span className="repo-change-warning">No tests ran.</span> You can still open a pull request; this goes in its description.</p>}
      {skipped && <p><span className="repo-change-warning">No test command found.</span> You can still open a pull request; this goes in its description.</p>}
      {!pr && <><div className="repo-ui-actions"><button className={`repo-ui-btn${passed ? " repo-ui-btn-primary" : ""}`} onClick={() => move("pr")}>Open pull request</button></div>{state === "pr-error" && <div role="alert"><p>GitHub couldn't open the pull request. Try again.</p><button className="repo-ui-btn" onClick={() => move("pr")}>Retry</button></div>}</>}
    </section>}
    {pr && <section className="repo-change-card"><p>Pull request #37 opened on GitHub from <code>smithers/landing-12</code>.{!passed && " main is unchanged."}</p>{state === "merged" ? <p>Merged on GitHub by maya. main is now <a href="https://github.com/maya/tinyhttp/commit/9c1e2ab" target="_blank" rel="noopener noreferrer">9c1e2ab</a>.</p> : <>{passed && <p>main is unchanged. Your review is next.</p>}<div className="repo-ui-actions"><a className="repo-ui-btn repo-ui-btn-primary" href="https://github.com/maya/tinyhttp/pull/37" target="_blank" rel="noopener noreferrer">Merge on GitHub ↗</a><a href="https://github.com/maya/tinyhttp/pull/37" target="_blank" rel="noopener noreferrer">View #37</a></div></>}</section>}
    {diff && content && createPortal(<section className="repo-change-main-diff"><header><h2>smithers/landing-12</h2><button className="repo-ui-btn" onClick={() => { const params = new URLSearchParams(location.split("?")[1]); params.delete("diff"); navigate(`${location.split("?")[0]}?${params}`) }}>Close diff</button></header>{[["src/slug.ts", slugSource], ["test/slug.test.ts", testSource]].map(([path, source]) => <section className="repo-change-card" key={path}><h3>{path}</h3><pre>{`diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${source.split("\n").length} @@\n${source.split("\n").map(line => `+${line}`).join("\n")}`}</pre></section>)}</section>, content)}
  </div>
}
