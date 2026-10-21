/** @jsxImportSource react */
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Annotation, Compartment, EditorState, StateEffect, StateField, Transaction } from "@codemirror/state";
import { Decoration, type DecorationSet, drawSelection, EditorView, keymap, lineNumbers, WidgetType } from "@codemirror/view";
import { type Collaborator, type FieldSelection, personLane } from "@smthrs/ui";
import { useLayoutEffect, useRef } from "react";

/**
 * A file's text, edited in CodeMirror, by several people at once when they
 * share it. Controlled: `value` is the text as everyone typed it, and each
 * edit the person makes comes out through `onChange` with the text it was
 * made on (`base`), so the host can merge it with edits that arrived
 * meanwhile. A `value` that changes from outside, someone else's typing,
 * goes in as one change that CodeMirror maps the person's selection and
 * scroll through, and never comes back out as an edit. Everyone else's
 * carets and selections show in their colors, flagged with their names, as
 * `ChatComposer`'s do, with `@smthrs/ui`'s styles on the page.
 */
export type CodeEditorProps = {
  readonly value: string;
  /** The person changed the text: the new text, the text it was made on, and their selection after. */
  readonly onChange?: (value: string, edit: { readonly base: string; readonly selection: FieldSelection }) => void;
  /** The person moved their caret or selection. */
  readonly onSelectionChange?: (selection: FieldSelection) => void;
  /** Everyone else's carets. */
  readonly collaborators?: ReadonlyArray<Collaborator>;
  /** Shows the text without letting the person change it. */
  readonly readOnly?: boolean;
  /** The editor's accessible name, such as the file's path. */
  readonly "aria-label"?: string;
  readonly className?: string;
};

/** Marks a change that came in from `value`, so it never goes out as the person's edit. */
const outside = Annotation.define<boolean>();

const setCollaborators = StateEffect.define<ReadonlyArray<Collaborator>>();

/** A collaborator's caret: a line in their color, flagged with their name. */
class CaretWidget extends WidgetType {
  constructor(readonly person: Collaborator) {
    super();
  }
  override eq(other: CaretWidget) {
    return other.person.id === this.person.id && other.person.name === this.person.name;
  }
  toDOM() {
    const caret = document.createElement("span");
    caret.className = "sui-collaborator-caret";
    caret.dataset.slot = "collaborator-caret";
    caret.dataset.name = this.person.name;
    caret.dataset.lane = String(personLane(this.person.id));
    caret.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "sui-collaborator-name";
    name.textContent = this.person.name;
    caret.append(name);
    return caret;
  }
}

/** Everyone else's carets and selections as decorations, at their places in `state`'s text. */
const decorationsOf = (state: EditorState, collaborators: ReadonlyArray<Collaborator>): DecorationSet => {
  const clamp = (index: number) => Math.max(0, Math.min(state.doc.length, index));
  const ranges = collaborators.flatMap((person) => {
    const from = clamp(Math.min(person.anchor, person.head));
    const to = clamp(Math.max(person.anchor, person.head));
    const lane = String(personLane(person.id));
    const selection = from < to
      ? [Decoration.mark({ class: "sui-collaborator-selection", attributes: { "data-lane": lane } }).range(from, to)]
      : [];
    return [...selection, Decoration.widget({ widget: new CaretWidget(person), side: 1 }).range(clamp(person.head))];
  });
  return Decoration.set(ranges, true);
};

/** The carets: replaced when the host sends new ones, moved with the text between. */
const carets = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (value, transaction) => {
    for (const effect of transaction.effects) {
      if (effect.is(setCollaborators)) return decorationsOf(transaction.state, effect.value);
    }
    return value.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "transparent" },
  ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)", lineHeight: "20px" },
  ".cm-gutters": { backgroundColor: "transparent", borderRight: "1px solid var(--border, #e5e0d6)", color: "var(--text-faint, #8a8579)" },
});

/** The selection of `state`'s main range, as the host counts it. */
const selectionIn = (state: EditorState): FieldSelection => ({
  anchor: state.selection.main.anchor,
  head: state.selection.main.head,
});

/** Edits a file's text in CodeMirror, together with `collaborators`. */
export function CodeEditor({
  value,
  onChange,
  onSelectionChange,
  collaborators = [],
  readOnly = false,
  "aria-label": label,
  className,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const access = useRef(new Compartment());
  const latest = useRef({ onChange, onSelectionChange });
  latest.current = { onChange, onSelectionChange };

  useLayoutEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          theme,
          carets,
          access.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          EditorView.contentAttributes.of({ "aria-label": label ?? "Code", "aria-multiline": "true" }),
          EditorView.updateListener.of((update) => {
            const typed = update.docChanged && !update.transactions.some((transaction) => transaction.annotation(outside));
            if (typed) {
              latest.current.onChange?.(update.state.doc.toString(), {
                base: update.startState.doc.toString(),
                selection: selectionIn(update.state),
              });
            } else if (update.selectionSet && !update.docChanged) {
              latest.current.onSelectionChange?.(selectionIn(update.state));
            }
          }),
        ],
      }),
    });
    editor.current = view;
    return () => {
      editor.current = null;
      view.destroy();
    };
  }, []);

  useLayoutEffect(() => {
    const view = editor.current!;
    const now = view.state.doc.toString();
    if (now !== value) {
      // One change between the common start and end, which CodeMirror maps the selection and scroll through.
      let from = 0;
      const shortest = Math.min(now.length, value.length);
      while (from < shortest && now[from] === value[from]) from++;
      let end = 0;
      while (end < shortest - from && now[now.length - 1 - end] === value[value.length - 1 - end]) end++;
      view.dispatch({
        changes: { from, to: now.length - end, insert: value.slice(from, value.length - end) },
        annotations: [outside.of(true), Transaction.addToHistory.of(false)],
      });
    }
    view.dispatch({
      effects: [
        setCollaborators.of(collaborators),
        access.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
      ],
    });
  }, [value, collaborators, readOnly]);

  return <div ref={host} data-slot="code-editor" className={className} />;
}
