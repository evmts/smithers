import { Badge, Button } from "@smthrs/ui"
import { TerminalFrame } from "@smthrs/ui/adapters/terminal-frame"
import { useLiveQuery } from "@tanstack/react-db"
import { useShownMode } from "../../theme/components/ThemeButton"
import { useTerminal } from "./TerminalContext"

// The branch's terminal (decision 0013 §3, §5): our xterm in an opaque-origin frame, attached to the person's shell on
// the branch's machine, or read-only to anyone else's. Open terminal while there is none; the copy is only `Offline`,
// `Ended`, `No access` and `Open terminal`.
export function TerminalPanel() {
  const { queries, actions } = useTerminal()
  const mode = useShownMode()
  const { data: panel } = useLiveQuery(queries.panel)
  if (panel === undefined || panel.branchId === null) return null
  const terminalId = panel.terminalId
  const attached = terminalId !== null &&
    (panel.phase === "connecting" || panel.phase === "open" || panel.phase === "offline")
  return (
    <section className="terminal-panel" aria-label="Terminal" data-phase={panel.phase}>
      {panel.phase === "offline" ? <Badge variant="muted">Offline</Badge> : null}
      {panel.phase === "ended" ? <Badge variant="muted">Ended</Badge> : null}
      {panel.phase === "no_access" ? <Badge variant="destructive">No access</Badge> : null}
      {panel.phase === "idle" || panel.phase === "ended" || panel.phase === "failed" || panel.phase === "opening" ? (
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
