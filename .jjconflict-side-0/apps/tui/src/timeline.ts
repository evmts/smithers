/**
 * The chat's rows, filtered the way a log view is: by kind of row and by
 * text. Workers show as subagent cards (`subagents.ts`), never as rows here.
 * Cells are the exception: hiding them hides the program, not what it did,
 * so a hidden cell still draws its `→ read`, `$ ran` and `← edited` rows.
 */
import * as CellDisplay from "./cell-display.ts"
import * as Scrubber from "./scrubber.ts"
import type * as Transcript from "./transcript.ts"

export type Kind = Transcript.Item["kind"]

export const kinds: ReadonlyArray<readonly [kind: Kind, label: string]> = [
  ["user", "Messages"],
  ["cell", "Cells"],
  ["shell", "Shell"],
  ["answer", "Answers"],
  ["error", "Errors"],
  ["note", "Notes"],
  ["card", "Cards"],
  ["run", "Runs"]
]

export interface Row {
  /** The row's element id: `chat:<item id>`. */
  readonly key: string
  readonly item: Transcript.Item
  readonly at: number
}

/** What is hidden; the empty filter shows everything. */
export interface Filter {
  readonly kinds: ReadonlyArray<Kind>
  readonly query: string
}

export const all: Filter = { kinds: [], query: "" }

/** The chat's own view: each cell's program hidden, the rest shown. */
export const initial: Filter = { kinds: ["cell"], query: "" }

/** Whether the filter hides more than the chat's own view does. */
export const active = (filter: Filter): boolean => filter.kinds.some((kind) => kind !== "cell") || filter.query !== ""

/** Whether cells draw their program: code, every call with its timing, and printed output. */
export const program = (filter: Filter): boolean => !filter.kinds.includes("cell")

const flip = <A>(values: ReadonlyArray<A>, value: A): ReadonlyArray<A> =>
  values.includes(value) ? values.filter((each) => each !== value) : [...values, value]

export const toggleKind = (filter: Filter, kind: Kind): Filter => ({ ...filter, kinds: flip(filter.kinds, kind) })

/** A chat item's row key. */
export const key = (id: string): string => `chat:${id}`

/** Everything a row says, for the text filter to match; a cell says what its row draws. */
export const text = (item: Transcript.Item, display: CellDisplay.Options = {
  expanded: false,
  program: true,
  chat: false,
  step: { notes: [] }
}): string => {
  switch (item.kind) {
    case "user":
    case "answer":
    case "error":
    case "note":
      return item.text
    case "shell":
      return `${item.command}\n${item.output}`
    case "card":
      return [item.panel.title, item.panel.summary, ...item.panel.rows.map((row) => row.label)].join("\n")
    case "run":
      return [item.request ?? "", item.title].join("\n")
    case "cell":
      return CellDisplay.text(item, display)
  }
}

/** How a view draws its rows, so search matches what it shows. */
export interface Display {
  /** Ctrl+O: every cell's program and failure details. */
  readonly expanded: boolean
  readonly chat: boolean
  /** The transcript whose journal the renderer reads, when the rows are a projection of it. */
  readonly source?: Transcript.Transcript
  /** The cell the activity scrubber selected, which draws its program. */
  readonly selected?: string
}

const ordinary: Display = { expanded: false, chat: false }

/**
 * The transcript's rows, oldest first. A row's time is never earlier than the
 * row before it: an item without a time, or with a skewed one, keeps its place.
 */
export const rows = (
  transcript: Transcript.Transcript,
  filter: Filter = all,
  display: Display = ordinary
): ReadonlyArray<Row> => {
  const query = filter.query.toLowerCase()
  let at = 0
  return transcript.items
    .map((item) => {
      at = Math.max(at, item.at ?? at)
      return { key: key(item.id), item, at }
    })
    .filter((row) => row.item.kind === "cell" || !filter.kinds.includes(row.item.kind))
    .filter((row) =>
      query === "" ||
      text(row.item, {
        expanded: display.expanded,
        chat: display.chat,
        program: program(filter),
        selected: row.item.id === display.selected,
        step: row.item.kind === "cell" ? Scrubber.step(display.source ?? transcript, row.item) : { notes: [] }
      }).toLowerCase().includes(query)
    )
}

/** One view's row cache: clock-only renders reuse rows without filtering again. */
export const cached = (): typeof rows => {
  let previous: Transcript.Transcript | undefined
  let selected: Filter | undefined
  let displayed: Display | undefined
  let kept: ReadonlyArray<Row> = []
  return (transcript, filter = all, display = ordinary) => {
    if (
      previous === transcript && selected === filter && displayed?.expanded === display.expanded &&
      displayed.chat === display.chat && displayed.source === display.source && displayed.selected === display.selected
    ) return kept
    previous = transcript
    selected = filter
    displayed = display
    kept = rows(transcript, filter, display)
    return kept
  }
}
