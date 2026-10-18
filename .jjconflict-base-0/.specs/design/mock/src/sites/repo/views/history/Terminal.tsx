import { useEffect, useRef, useState } from "react"
import { useMock } from "../../../core/mock"
import { Link, useLocation } from "../../../core/router"
import { registerSlash, Loading, Failed, Empty, SignInWall, Denied, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { branch, children, commit, history, MOCK_NOW, repo, shortSha, to } from "../../fixtures"
import type { Branch } from "../../fixtures/types"
import { Box, CopyButton, PageHeader, RelTime, toast } from "../../ui"
import { localBranches } from "./Branches"
import { Cancel, HistoryDialog, HistoryIcon as Icon, LocalInstall, uptime, useHistoryCommands } from "./shared"

type ShellEntry = { command: string; output: string }
type SandboxState = "running" | "suspended"
const shellKey = (name: string) => "repo-history-shell:" + repo.slug + ":" + name

const testOutput = (item: Branch) => {
  const tests = commit(item.head)?.checks.find(check => /test/i.test(check.name))
  return "bun test v1.3.1\n\n" + (tests?.detail ?? "31 pass\n0 fail\nRan 31 tests across 6 files. [34ms]")
}

const commandOutput = (command: string, item: Branch) => {
  if (command === "pwd") return "~/" + repo.name
  if (command === "ls") return children("").map(entry => entry.path.split("/")[0] + (entry.kind === "dir" ? "/" : "")).join("  ")
  if (command === "bun test") return testOutput(item)
  if (command === "git log --oneline -3") {
    return history(item.name).slice(0, 3).map(value => shortSha(value.sha) + " " + value.title).join("\n")
  }
  return "command not found in this mock"
}

export const TerminalLoading = () => <Loading variant="file" rows={9} />
export const TerminalError = () => <Failed what="this sandbox" reason="The sandbox host didn't respond." />
export const TerminalEmpty = ({ name }: { name: string }) => <Empty title="Branch not found." action={<Link className="repo-ui-btn repo-ui-btn-quiet" title="/branches" to={to("branches")}>Open branches</Link>}><p className="repo-history-missing-sha">{name}</p></Empty>
export const TerminalSignedOut = () => <SignInWall act="open a sandbox" />
export const TerminalDenied = () => <Denied act="open a sandbox" />
export const TerminalPaused = () => (
  <Box>
    <section className="repo-history-paused">
      <Icon name="terminal" size={24} />
      <h1>Sandboxes are paused on smithers.sh right now</h1>
      <p>Hosted machines are unavailable.</p>
      <LocalInstall />
    </section>
  </Box>
)

export const TerminalReady = ({ item }: { item: Branch }) => {
  const location = useLocation()
  const query = new URLSearchParams(location.split("?")[1])
  const [state, setState] = useState<SandboxState>(() => {
    if (query.get("state") === "suspended" || query.get("state") === "running") return query.get("state") as SandboxState
    try {
      const saved = sessionStorage.getItem(shellKey(item.name))
      if (saved === "running" || saved === "suspended") return saved
    } catch { /* fall through to the fixture */ }
    return item.sandbox?.state ?? "running"
  })
  const [since, setSince] = useState(item.sandbox?.since ?? MOCK_NOW)
  const [confirm, setConfirm] = useState(false)
  const [input, setInput] = useState("")
  const [entries, setEntries] = useState<ShellEntry[]>(() => [
    { command: "pwd", output: commandOutput("pwd", item) },
    { command: "bun test", output: testOutput(item) },
    { command: "git log --oneline -3", output: commandOutput("git log --oneline -3", item) }
  ])
  const transcript = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight
  }, [entries])
  const [commands, setCommands] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const id = item.sandbox?.id ?? shortSha(item.head)
  const sandboxLabel = "sandbox " + id.replace(/^box-/, "")
  const slug = repo.slug.replaceAll("/", "-")
  const ssh = "ssh " + item.name.replace(/[^a-zA-Z0-9-]/g, "-") + "." + slug + "@smithers.sh"
  const ports = item.sandbox?.ports ?? []
  const execute = (raw: string) => {
    const command = raw.trim()
    if (!command) return
    if (state === "suspended") throw new Error("Resume the sandbox first.")
    setEntries(current => [...current, { command, output: commandOutput(command, item) }])
    setCommands(current => [...current, command])
    setCursor(commands.length + 1)
    setInput("")
    requestAnimationFrame(() => document.getElementById("repo-history-shell-input")?.scrollIntoView({ block: "nearest" }))
  }
  useEffect(() => {
    const branchField = { name: "branch", label: "Branch", options: [item.name] }
    const dispose = [
      ...(["suspend", "resume"] as const).map(action => registerSlash("box." + action, {
        purpose: action === "suspend" ? "Suspend sandbox" : "Resume sandbox", fields: [branchField], confirm: false,
        run: (_values, { closeAsk }) => {
          if ((action === "suspend") === (state === "suspended")) {
            toast(action === "suspend" ? "Sandbox is suspended." : "Sandbox is running.")
          } else { closeAsk(); setConfirm(true) }
        }
      })),
      registerSlash("box.exec", {
        purpose: "Run a shell command", fields: [branchField, { name: "command", label: "Command" }], confirm: false,
        run: ({ command }) => execute(command)
      })
    ]
    return () => dispose.forEach(cleanup => cleanup())
  }, [item.name, item.head, state, commands.length])
  const changeState = () => {
    const next = state === "running" ? "suspended" : "running"
    setState(next)
    setSince(MOCK_NOW)
    try { sessionStorage.setItem(shellKey(item.name), next) } catch { /* local view state remains */ }
    const updated = localBranches().map(value => value.name === item.name ? {
      ...value, sandbox: { id, state: next as SandboxState, since: MOCK_NOW, ports }
    } : value)
    try { sessionStorage.setItem("repo-history-branches:" + repo.slug, JSON.stringify(updated)) } catch { /* optional */ }
    setConfirm(false)
    toast(next === "running" ? "Sandbox resumed." : "Sandbox suspended.")
  }
  return (
    <div className="repo-history-stack">
      <PageHeader
        title={(
          <span className="repo-history-terminal-title">
            <Icon name="terminal" size={22} />
            <Link to={to("tree/" + encodeURIComponent(item.name))}>{item.name}</Link>
          </span>
        )}
        actions={(
          <button
            className={"repo-ui-btn" + (state === "suspended" ? " repo-ui-btn-primary" : "")}
            title={"/box." + (state === "running" ? "suspend " : "resume ") + item.name}
            onClick={() => setConfirm(true)}
          >
            {state === "running" ? "Suspend" : "Resume"}
          </button>
        )}
      />
      <section className="repo-history-terminal-card" aria-label="Sandbox terminal">
        <header className="repo-history-terminal-header">
          <div className="repo-history-terminal-status">
            <code>{sandboxLabel}</code>
            <span className={"repo-history-dot repo-history-dot-" + state} />
            <span>{state === "running" ? "Running" : "Suspended"}</span>
            {state === "running" ? <span className="repo-history-muted">up {uptime(since)}</span>
              : <span className="repo-history-muted">since <RelTime date={since} /></span>}
          </div>
          <div className="repo-history-terminal-ports">
            {ports.map(port => state === "running" ? (
              <a
                key={port}
                href={"https://" + id + "-" + port + ".smithers.sh"}
                target="_blank"
                rel="noopener noreferrer"
              >
                :{port}<Icon name="external" size={12} />
              </a>
            ) : <span className="repo-history-muted" key={port}>:{port}</span>)}
          </div>
        </header>
        {item.run && (
          <div className="repo-history-terminal-watcher">
            <Icon name="agent" size={14} />
            Watched by the agent
            <Link to={to("runs/" + item.run)}>{item.run}</Link>
          </div>
        )}
        <div className="repo-history-terminal-pane">
          <div ref={transcript} className="repo-history-terminal-transcript" role="log" aria-live="polite" aria-label="Shell output">
          <div className="repo-history-terminal-location">~/{repo.name}</div>
          {entries.map((entry, i) => (
            <div className="repo-history-shell-entry" key={i}>
              <div className="repo-history-shell-command"><span>$</span> {entry.command}</div>
              <pre>{entry.output}</pre>
            </div>
          ))}
          </div>
          {state === "suspended" ? (
            <div className="repo-history-shell-paused">Session suspended. Resume to continue.</div>
          ) : (
            <form
              className="repo-history-shell-input" data-primary="type"
              onSubmit={event => {
                event.preventDefault()
                execute(input)
              }}
            >
              <label className="repo-ui-sr" htmlFor="repo-history-shell-input">Type a command</label>
              <span aria-hidden="true">$</span>
              <input
                id="repo-history-shell-input"
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
                  event.preventDefault()
                  const next = Math.max(0, Math.min(commands.length, cursor + (event.key === "ArrowUp" ? -1 : 1)))
                  setCursor(next)
                  setInput(commands[next] ?? "")
                }}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Type a command…"
              />
              <button
                className="repo-ui-icon-btn"
                title={"/box.exec " + item.name + " " + (input || "<command>")}
                aria-label="Run command"
                disabled={!input.trim()}
              >
                <Icon name="arrow-up" size={15} />
              </button>
            </form>
          )}
        </div>
        <footer className="repo-history-terminal-footer">
          <span>SSH</span>
          <code>{ssh}</code>
          <CopyButton text={ssh} label="Copy SSH" small />
        </footer>
      </section>
      {confirm && (
        <HistoryDialog title={state === "running" ? "Suspend sandbox?" : "Resume sandbox?"} onClose={() => setConfirm(false)}>
          <p className="repo-history-confirm-branch">{sandboxLabel} · {item.name}</p>
          <p className="repo-history-muted">{state === "running" ? "Keep the session and stop its processes." : "Restart the saved session."}</p>
          <div className="repo-ui-actions">
            <button
              className="repo-ui-btn repo-ui-btn-primary"
              title={"/box." + (state === "running" ? "suspend.confirm " : "resume.confirm ") + item.name}
              onClick={changeState}
            >
              {state === "running" ? "Suspend" : "Resume"}
            </button>
            <Cancel onClick={() => setConfirm(false)} />
          </div>
        </HistoryDialog>
      )}
    </div>
  )
}

export const TerminalSuspended = ({ item }: { item: Branch }) => <TerminalReady item={item} />

export const TerminalPage = ({ name }: { name: string }) => {
  useHistoryCommands()
  const { flags } = useMock()
  const state = useView("terminal:" + repo.slug + ":" + name)
  const item = localBranches().find(value => value.name === name) ?? branch(name)
  return (
    <RepoFrame tab="code" title={name + " · Sandbox · " + repo.slug} askView="branches" askContext={name + " sandbox"}>
      <div className="repo-history-page">
        {flags.as === "out" ? <TerminalSignedOut /> : flags.role !== "member" ? <TerminalDenied />
          : flags.host === "hosted" && flags.hosted === "paused" ? <TerminalPaused />
          : state === "loading" ? <TerminalLoading /> : state === "error" ? <TerminalError />
          : state === "empty" || !item ? <TerminalEmpty name={name} />
          : <TerminalReady key={repo.slug + ":" + name} item={item} />}
      </div>
    </RepoFrame>
  )
}
