import { Facet, type Extension } from "@codemirror/state"
import { Decoration, EditorView, GutterMarker, gutter } from "@codemirror/view"
import type { Actor } from "@smthrs/rpc/CardPrimitives"
import type { AuthorRange, FileCard } from "@smthrs/rpc/FileCard"
import { actorName } from "./actorName"

/** The live binding publishes attributed ranges through this facet. */
export const authorRanges = Facet.define<readonly AuthorRange[], readonly AuthorRange[]>({ combine: values => values.flat() })
const colour = (actor: Actor) => actor.kind === "agent" && actor.agent === "smithers" && !actor.for_member ? "var(--text)" : `var(--lane-${actor.color_index})`
class NameFlag extends GutterMarker {
  constructor(readonly actors: readonly Actor[]) { super() }
  eq(other: NameFlag) { return JSON.stringify(this.actors) === JSON.stringify(other.actors) }
  toDOM() {
    const flag = document.createElement("span")
    flag.className = "code-name-flag"
    flag.title = this.actors.map(actorName).join(", ")
    flag.style.setProperty("--who", colour(this.actors[0]!))
    flag.dataset.kind = this.actors[0]!.kind
    const name = document.createElement("span")
    name.textContent = actorName(this.actors[0]!)
    flag.append(name)
    if (this.actors.length > 1) {
      const count = document.createElement("b")
      count.textContent = `+${this.actors.length - 1}`
      flag.append(count)
    }
    return flag
  }
}
/** Visuals only; presence and attribution arrive through props and the binding. */
export function coEditing(model: Pick<FileCard, "authors" | "editors">): Extension {
  return [
    EditorView.decorations.compute([authorRanges, "doc"], state => Decoration.set(state.facet(authorRanges).flatMap(range => {
      const actor = model.authors[range.author]
      const from = Math.max(0, range.from), to = Math.min(state.doc.length, range.to)
      return actor && from < to ? [Decoration.mark({ class: "code-author-range", attributes: { style: `--who: ${colour(actor)}`, title: actorName(actor) } }).range(from, to)] : []
    }), true)),
    gutter({ class: "code-name-gutter", lineMarker: (view, line) => {
      const number = view.state.doc.lineAt(line.from).number
      const actors = model.editors.filter(editor => editor.line === number).map(editor => editor.actor)
      return actors.length ? new NameFlag(actors) : null
    } }),
  ]
}
