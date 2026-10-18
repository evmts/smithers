/** View modules the tests share. */

/** The components the test bundle carries. */
export const components = ["Badge", "Button", "Card"] as const

/** Tic-tac-toe: a state interaction per cell, a message to play again. */
export const ticTacToe = `import { Badge, Button, Card } from "@smthrs/ui"
import type { ViewProps } from "smithers:view"

type Board = { readonly cells: ReadonlyArray<string>; readonly turn: "X" | "O" }

export const interactions = {
  cell: { kind: "state" },
  again: { kind: "message", label: "Play again" }
} as const

export const reduce = (state: Board, event: { name: string; arg?: string }): Board => {
  const index = Number(event.arg)
  if (event.name !== "cell" || state.cells[index] !== "") return state
  const cells = state.cells.map((cell, at) => (at === index ? state.turn : cell))
  return { cells, turn: state.turn === "X" ? "O" : "X" }
}

export default function View({ props, state }: ViewProps<Board>) {
  return (
    <Card className="board">
      <Badge>{props.title} · {state.turn}</Badge>
      <div role="grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 3rem)" }}>
        {state.cells.map((cell, index) => (
          <Button key={index} aria-label={"cell " + index} data-event={"cell:" + index}>{cell}</Button>
        ))}
      </div>
      <Button data-event="again">Again</Button>
    </Card>
  )
}
`

/** The empty board `ticTacToe` starts from. */
export const emptyBoard = { cells: ["", "", "", "", "", "", "", "", ""], turn: "X" }

/** A comparison table with no interactions. */
export const comparison = `import { Card } from "@smthrs/ui"
export default function View({ props }: { props: { rows: Array<{ name: string; kind: string }> } }) {
  return (
    <Card>
      <table>
        <thead><tr><th>Name</th><th>Kind</th></tr></thead>
        <tbody>{props.rows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.kind}</td></tr>)}</tbody>
      </table>
      <svg viewBox="0 0 10 10" width="10"><circle cx="5" cy="5" r="4" fill="currentColor" /></svg>
    </Card>
  )
}
`

/** A module whose body is `body`, inside a component. */
export const viewWith = (body: string, head = "") =>
  `${head}\nexport default function View() {\n${body}\n  return <div />\n}\n`
