import { type RepoViewCode, type RepoViewLocation, SymbolsPane } from "@smthrs/repo-view"
import { Button, Markdown } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import type { ReactNode } from "react"
import { problemsLabel, SYMBOLS } from "../contract"
import { hoverCardOf, marksOf, paneOf } from "../view"
import { useCodeIntel } from "./CodeIntelContext"

/** What the repository page adds to a file it shows: the code's props, the Symbols pane and the toolbar's buttons. */
export interface CodeIntelParts {
  readonly code?: RepoViewCode
  readonly aside?: ReactNode
  readonly toolbar?: ReactNode
}

/** Code intelligence's row, live, and its actions: read once at the top of a page, before it returns early. */
export function useCodeIntelRow() {
  const { queries, actions } = useCodeIntel()
  const { data: row } = useLiveQuery(queries.state)
  return { row, actions }
}

/**
 * Code intelligence for the file at `path` (`undefined` on a directory): the marks, the hover card, the cursor and the
 * gestures on its code, the Symbols pane beside it, and the problem count and Symbols in its toolbar. Nothing until
 * the language server has the file.
 */
export function codeIntelParts(
  { row, actions }: ReturnType<typeof useCodeIntelRow>,
  path: string | undefined,
  href: (location: RepoViewLocation) => string,
  onOpen: (location: RepoViewLocation) => void,
): CodeIntelParts {
  if (row === undefined || path === undefined || row.path !== path) return {}
  const card = hoverCardOf(row)
  const pane = paneOf(row)
  return {
    code: {
      marks: marksOf(row),
      cursor: row.cursor ?? undefined,
      hover: card === undefined ? undefined : {
        ...card,
        body: card.documentation === "" ? undefined : <Markdown content={card.documentation} variant="document" />,
      },
      onTokenRest: actions.rest,
      onTokenSelect: actions.select,
      onTokenActivate: actions.activate,
      onCursorMove: actions.move,
      onKeyDown: (event) => {
        if (actions.key(event.key, event.shiftKey, event)) event.preventDefault()
      },
    },
    aside: pane === undefined ? undefined : (
      <SymbolsPane path={path} {...pane} href={href} onOpen={onOpen} onClose={actions.togglePane} />
    ),
    toolbar: (
      <>
        {row.problems.length === 0 ? null : (
          <Button variant="ghost" size="sm" onClick={actions.nextProblem}>{problemsLabel(row.problems.length)}</Button>
        )}
        <Button variant={row.pane ? "secondary" : "ghost"} size="sm" aria-pressed={row.pane} onClick={actions.togglePane}>
          {SYMBOLS}
        </Button>
      </>
    ),
  }
}
