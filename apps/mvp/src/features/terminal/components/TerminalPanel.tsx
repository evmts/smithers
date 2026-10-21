import { Badge, Button } from "@smthrs/ui"
import { TerminalFrame } from "@smthrs/terminal-frame"
import { useLiveQuery } from "@tanstack/react-db"
import { Link, useParams } from "@tanstack/react-router"
import { useShownMode } from "../../theme/components/ThemeButton"
import { useTerminal } from "./TerminalContext"

// The branch's terminal (decision 0013 §3, §5): our xterm in an opaque-origin frame, attached to a shell on the
// branch's machine, typing for anyone who may edit the branch and read-only for anyone who may only view it. Its tabs
// are the branch's live terminals, by owner; `canOpen` offers Open terminal to someone who may edit and has none. The
// copy is only the owners' logins, `Offline`, `Ended`, `No access` and `Open terminal`.
export function TerminalPanel({ canOpen }: { readonly canOpen: boolean }) {
  const { queries, actions } = useTerminal()
  const mode = useShownMode()
  const params = useParams({ strict: false })
  const { data: panel } = useLiveQuery(queries.panel)
  const { data: tabs } = useLiveQuery(queries.tabs)
  if (panel === undefined || panel.branchId === null) return null
  const terminalId = panel.terminalId
  const attached = terminalId !== null &&
    (panel.phase === "connecting" || panel.phase === "open" || panel.phase === "offline")
  const routeParams = { owner: params.owner ?? "", repo: params.repo ?? "", ref: params.ref ?? "", _splat: params._splat ?? "" }
  const offerOpen = canOpen && (panel.phase === "opening" || !tabs.some((tab) => tab.mine))
  return (
    <section className="terminal-panel" aria-label="Terminal" data-phase={panel.phase}>
      {tabs.length > 0 ? (
        <nav className="terminal-panel-tabs" aria-label="Terminals">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              to="/$owner/$repo/tree/$ref/$"
              params={routeParams}
              search={{ terminal: tab.mine ? "me" : tab.id }}
              aria-current={tab.id === terminalId ? "page" : undefined}
            >
              {tab.ownerLogin}
            </Link>
          ))}
        </nav>
      ) : null}
      {panel.phase === "offline" ? <Badge variant="muted">Offline</Badge> : null}
      {panel.phase === "ended" ? <Badge variant="muted">Ended</Badge> : null}
      {panel.phase === "no_access" ? <Badge variant="destructive">No access</Badge> : null}
      {offerOpen ? (
        // While the machine wakes the button stays, disabled: the app shows no loading state of its own.
        <Button onClick={actions.open} disabled={panel.phase === "opening"}>
          Open terminal
        </Button>
      ) : null}
      {attached ? (
        <TerminalFrame
          key={terminalId}
          className="terminal-panel-frame"
          title="Terminal"
          theme={mode}
          readOnly={panel.access === "read"}
          stream={(write) => actions.attach(terminalId, write)}
          onInput={actions.input}
          onResize={actions.resize}
        />
      ) : null}
    </section>
  )
}
