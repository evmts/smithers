// The live editors under happy-dom: `CodeEditor` is CodeMirror, which runs here without layout, and
// `LiveMarkdownEditor` renders the Markdown editor's controlled `<textarea>` fallback, as the Markdown editor's own
// tests do. e2e/coedit.spec.ts in apps/mvp drives both in Chromium.
import { afterEach, describe, expect, test } from "bun:test";
import { EditorView } from "@codemirror/view";
import type { Collaborator, FieldSelection } from "@smthrs/ui";
import { personLane } from "@smthrs/ui";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CodeEditor, LiveMarkdownEditor } from "../src/index";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root) {
    const r = root;
    await act(async () => r.unmount());
    root = undefined;
  }
  container?.remove();
  container = undefined;
});

async function render(element: ReactElement): Promise<void> {
  if (container === undefined) {
    container = document.createElement("div");
    document.body.appendChild(container);
  }
  root ??= createRoot(container);
  const r = root;
  await act(async () => r.render(element));
}

const view = () => EditorView.findFromDOM(container!.querySelector<HTMLElement>(".cm-editor")!)!;
const carets = () =>
  [...container!.querySelectorAll<HTMLElement>('[data-slot="collaborator-caret"]')].map((caret) => [
    caret.dataset.name,
    caret.dataset.lane,
    caret.textContent,
  ]);

const BEN: Collaborator = { id: "conn-ben", name: "ben", anchor: 2, head: 2 };

describe("CodeEditor", () => {
  test("says what the person typed, with the text it was typed on and the selection after", async () => {
    const edits: Array<[string, { readonly base: string; readonly selection: FieldSelection }]> = [];
    const selections: Array<FieldSelection> = [];
    await render(
      <CodeEditor
        value="hello"
        aria-label="README"
        onChange={(value, edit) => edits.push([value, edit])}
        onSelectionChange={(selection) => selections.push(selection)}
      />,
    );
    expect(view().state.doc.toString()).toBe("hello");
    expect(view().contentDOM.getAttribute("aria-label")).toBe("README");
    await act(async () => view().dispatch({ changes: { from: 5, insert: "!" }, selection: { anchor: 6 } }));
    expect(edits).toEqual([["hello!", { base: "hello", selection: { anchor: 6, head: 6 } }]]);
    await act(async () => view().dispatch({ selection: { anchor: 4, head: 1 } }));
    expect(selections).toEqual([{ anchor: 4, head: 1 }]);
  });

  test("takes a value from outside as one change that moves the person's selection, and never echoes it", async () => {
    const edits: Array<string> = [];
    const onChange = (value: string) => void edits.push(value);
    await render(<CodeEditor value="hello world" onChange={onChange} />);
    await act(async () => view().dispatch({ selection: { anchor: 6, head: 11 } }));
    await render(<CodeEditor value=">> hello world" onChange={onChange} />);
    expect(view().state.doc.toString()).toBe(">> hello world");
    expect([view().state.selection.main.anchor, view().state.selection.main.head]).toEqual([9, 14]);
    // A value the editor already shows changes nothing.
    await render(<CodeEditor value=">> hello world" onChange={onChange} />);
    expect(edits).toEqual([]);
  });

  test("draws everyone else's carets and selections in their colors, flagged with their names, and moves them", async () => {
    await render(<CodeEditor value="hello world" collaborators={[BEN]} />);
    expect(carets()).toEqual([["ben", String(personLane("conn-ben")), "ben"]]);
    await render(<CodeEditor value="hello world" collaborators={[{ ...BEN, anchor: 0, head: 5 }]} />);
    expect(container!.querySelector(".sui-collaborator-selection")!.textContent).toBe("hello");
    expect(container!.querySelector<HTMLElement>(".sui-collaborator-selection")!.dataset.lane).toBe(String(personLane("conn-ben")));
    // The same carets again redraw nothing; a place past the end stays at the end.
    await render(<CodeEditor value="hello world" collaborators={[{ ...BEN, anchor: 0, head: 5 }]} />);
    await render(<CodeEditor value="hello world" collaborators={[{ ...BEN, anchor: 99, head: 99 }]} />);
    expect(carets()).toEqual([["ben", String(personLane("conn-ben")), "ben"]]);
    // Typing before a caret carries it along until the host sends where it is.
    await act(async () => view().dispatch({ changes: { from: 0, insert: "> " } }));
    expect(carets()).toHaveLength(1);
    await render(<CodeEditor value="hello world" collaborators={[]} />);
    expect(carets()).toEqual([]);
  });

  test("read-only shows the text without letting the person change it", async () => {
    await render(<CodeEditor value="read me" readOnly />);
    expect(view().contentDOM.getAttribute("contenteditable")).toBe("false");
    await render(<CodeEditor value="read me" />);
    expect(view().contentDOM.getAttribute("contenteditable")).toBe("true");
  });
});

describe("LiveMarkdownEditor", () => {
  test("takes a value from outside without echoing it, and says what the person typed and on what", async () => {
    const edits: Array<[string, string]> = [];
    const onChange = (markdown: string, { base }: { readonly base: string }) => void edits.push([markdown, base]);
    await render(<LiveMarkdownEditor value="# Title" fallback aria-label="README.md" onChange={onChange} />);
    const field = () => container!.querySelector("textarea")!;
    expect(field().value).toBe("# Title");
    await render(<LiveMarkdownEditor value={"# Title\n\nPeer"} fallback aria-label="README.md" onChange={onChange} />);
    expect(field().value).toBe("# Title\n\nPeer");
    expect(edits).toEqual([]);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(field(), "# Title\n\nPeer and me");
      field().dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(edits).toEqual([["# Title\n\nPeer and me", "# Title\n\nPeer"]]);
  });

  test("works without a listener", async () => {
    await render(<LiveMarkdownEditor value="x" fallback />);
    await act(async () => {
      const field = container!.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "xy");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container!.querySelector("textarea")!.value).toBe("xy");
  });
});
