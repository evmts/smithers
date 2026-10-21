import type { Panel, Tab } from "./schema"

// What the Terminal view shows (decision 0013 §5, docs/features/branch-workspace.md#the-page): pure, so its React view
// only renders it. The view always has its screen, the terminal's place on the page, so it is never a blank page: the
// terminal itself, Open terminal in its middle, or `No terminals` for someone who can't open one.

/** What a branch that has no live terminal shows someone who can't open one. */
export const NO_TERMINALS = "No terminals"

/** The button that opens this person's own terminal on the branch's machine. */
export const OPEN_TERMINAL = "Open terminal"

/**
 * The Terminal view:
 * - `tabs`: the branch's live terminals by owner; `badge`: `Offline`, `Ended` or `No access`;
 * - `open`: Open terminal, for someone who may edit and has no terminal of their own; `opening` while the machine wakes,
 *   when the button is disabled and a spinner shows, because the wait is the machine's, not the app's;
 * - `screen`: the terminal attached (`frame`, read-only for a viewer); else Open terminal in the screen's middle
 *   (`open`); else nothing to attach to (`empty`), which says `NO_TERMINALS` when the branch has none and no badge
 *   says more.
 */
export interface PanelView {
  readonly badge: "Offline" | "Ended" | "No access" | undefined
  readonly open: "button" | "opening" | undefined
  readonly screen:
    | { readonly kind: "frame"; readonly terminalId: string; readonly readOnly: boolean }
    | { readonly kind: "open" }
    | { readonly kind: "empty"; readonly text: string | undefined }
}

const BADGES: Partial<Record<Panel["phase"], PanelView["badge"]>> = {
  offline: "Offline",
  ended: "Ended",
  no_access: "No access",
}

/** The Terminal view for this tab's `panel`, the branch's live `tabs`, and whether this person may open a terminal. */
export const panelViewOf = (
  panel: Panel | undefined,
  tabs: ReadonlyArray<Tab>,
  canOpen: boolean,
): PanelView | undefined => {
  if (panel === undefined || panel.branchId === null) return undefined
  const badge = BADGES[panel.phase]
  const offered = canOpen && (panel.phase === "opening" || !tabs.some((tab) => tab.mine))
  const open = !offered ? undefined : panel.phase === "opening" ? "opening" : "button"
  const attached = panel.terminalId !== null &&
    (panel.phase === "connecting" || panel.phase === "open" || panel.phase === "offline")
  if (attached) return { badge, open, screen: { kind: "frame", terminalId: panel.terminalId!, readOnly: panel.access === "read" } }
  if (open !== undefined) return { badge, open, screen: { kind: "open" } }
  return { badge, open, screen: { kind: "empty", text: badge === undefined && tabs.length === 0 ? NO_TERMINALS : undefined } }
}
