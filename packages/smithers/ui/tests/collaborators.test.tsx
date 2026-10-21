/** @jsxImportSource react */
// Other people's carets in a shared field under happy-dom: real createRoot + act. The mirror's layout follows the
// field's computed style, which happy-dom reports without layout, so these tests check what is drawn and where in the
// text, and what the field does with its own selection; e2e/coedit.spec.ts sees the carets over real fields in Chromium.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NeedsYouCard } from "../src/agent-status/NeedsYouCard";
import { ChatComposer } from "../src/chat/ChatComposer";
import {
  type Collaborator,
  CollaboratorCarets,
  collaboratorsCss,
  type FieldSelection,
  personLane,
  selectionOf,
  SMITHERS_UI_STYLE_ATTR,
  smithersUiCss,
  useSharedSelection,
} from "../src/index";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root) {
    const mounted = root;
    await act(async () => mounted.unmount());
    root = undefined;
  }
  container?.remove();
  container = undefined;
  document.querySelectorAll(`style[${SMITHERS_UI_STYLE_ATTR}]`).forEach((el) => el.remove());
});

async function render(element: ReactElement): Promise<void> {
  if (container === undefined) {
    container = document.createElement("div");
    // Appended once: moving it would take focus from its field.
    document.body.appendChild(container);
  }
  root ??= createRoot(container);
  const mounted = root;
  await act(async () => mounted.render(element));
}

const BEN: Collaborator = { id: "conn-ben", name: "ben", anchor: 6, head: 6 };
const SUE: Collaborator = { id: "conn-sue", name: "sue", anchor: 0, head: 5 };

/**
 * Selects in a focused field as a person does: React reports it from the document's `selectionchange`, after the
 * pointer is up (a test before may have left it down).
 */
const selectIn = async (field: HTMLTextAreaElement | HTMLInputElement, start: number, end: number) => {
  field.focus();
  await act(async () => {
    field.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    field.setSelectionRange(start, end);
    document.dispatchEvent(new Event("selectionchange"));
  });
};

const carets = () => [...container!.querySelectorAll<HTMLElement>('[data-slot="collaborator-caret"]')];
const marks = () => [...container!.querySelectorAll<HTMLElement>('[data-slot="collaborator-selection"]')];
const mirror = () => container!.querySelector<HTMLElement>(".sui-collaborator-mirror");

/** A field with carets over it, as a host draws them. */
function Field({ value, collaborators, input = false }: { value: string; collaborators: ReadonlyArray<Collaborator>; input?: boolean }) {
  const field = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  return (
    <div className="sui-collaborative-field">
      {input ? <input ref={field} value={value} readOnly /> : <textarea ref={field} value={value} readOnly />}
      <CollaboratorCarets field={field} value={value} collaborators={collaborators} />
    </div>
  );
}

describe("CollaboratorCarets", () => {
  test("draws each person's caret where it is, flagged with their name in their color, and nothing for nobody", async () => {
    await render(<Field value="hello world" collaborators={[]} />);
    expect(container!.querySelector('[data-slot="collaborator-carets"]')).toBeNull();
    await render(<Field value="hello world" collaborators={[BEN]} />);
    expect(carets().map((caret) => [caret.dataset.name, caret.dataset.lane, caret.textContent])).toEqual([
      ["ben", String(personLane("conn-ben")), "ben"],
    ]);
    // The caret sits between "hello " and "world"; the text around it is the field's, drawn transparent.
    expect(mirror()!.textContent).toBe("hello benworld​");
    expect(container!.querySelector('[data-slot="collaborator-carets"]')!.getAttribute("aria-hidden")).toBe("true");
  });

  test("tints a selection in its owner's color, caret at its head, a backward one included", async () => {
    await render(<Field value="hello world" collaborators={[SUE, { ...BEN, anchor: 11, head: 6 }]} />);
    expect(marks().map((mark) => [mark.textContent, mark.dataset.lane])).toEqual([
      ["hello", String(personLane("conn-sue"))],
      ["world", String(personLane("conn-ben"))],
    ]);
    expect(carets().map((caret) => caret.dataset.name)).toEqual(["sue", "ben"]);
    expect(mirror()!.textContent).toBe("hellosue benworld​");
  });

  test("keeps carets inside the text: a place past either end goes to that end", async () => {
    await render(<Field value="abc" collaborators={[{ ...BEN, anchor: 99, head: 99 }, { ...SUE, anchor: -4, head: -4 }]} />);
    expect(mirror()!.textContent).toBe("sueabcben​");
  });

  test("lays its mirror out as the field: one line for an input, wrapping lines for a textarea", async () => {
    await render(<Field value="abc" collaborators={[BEN]} input />);
    expect(mirror()!.style.whiteSpace).toBe("pre");
    await render(<Field value="abc" collaborators={[BEN]} />);
    expect(mirror()!.style.whiteSpace).toBe("pre-wrap");
    // Scrolling the field moves the carets with its text.
    const field = container!.querySelector("textarea")!;
    field.scrollTop = 12;
    await act(async () => field.dispatchEvent(new Event("scroll")));
    expect(mirror()!.style.transform).toBe("translate(0px, -12px)");
  });

  test("ships its sheet with the library's", () => {
    expect(smithersUiCss).toContain(collaboratorsCss.trim().split("\n")[0]!);
    for (let lane = 0; lane < 6; lane++) expect(collaboratorsCss).toContain(`[data-lane='${lane}']`);
  });
});

describe("selectionOf and useSharedSelection", () => {
  test("reads a selection with its direction", () => {
    const field = document.createElement("textarea");
    document.body.append(field);
    field.value = "hello";
    field.setSelectionRange(1, 4, "forward");
    expect(selectionOf(field)).toEqual({ anchor: 1, head: 4 });
    field.setSelectionRange(1, 4, "backward");
    expect(selectionOf(field)).toEqual({ anchor: 4, head: 1 });
    field.remove();
  });

  /** A controlled textarea whose value can change from outside, as someone else's typing does. */
  function Shared({ value, selection, onTyped }: { value: string; selection?: FieldSelection; onTyped: (value: string) => void }) {
    const field = useRef<HTMLTextAreaElement>(null);
    const typed = useSharedSelection(field, value, selection);
    return (
      <textarea
        ref={field}
        value={value}
        onChange={(event) => {
          typed(event.currentTarget.value);
          onTyped(event.currentTarget.value);
        }}
      />
    );
  }

  test("a focused field takes the person's selection when its value changes from outside, and keeps its own when they type", async () => {
    const typed: Array<string> = [];
    await render(<Shared value="world" onTyped={(value) => typed.push(value)} />);
    const field = container!.querySelector("textarea")!;
    field.focus();
    field.setSelectionRange(5, 5);
    // Someone typed "hello " before the person's caret: it follows.
    await render(<Shared value="hello world" selection={{ anchor: 11, head: 11 }} onTyped={(value) => typed.push(value)} />);
    expect([field.selectionStart, field.selectionEnd]).toEqual([11, 11]);
    await render(<Shared value="hello world!" selection={{ anchor: 9, head: 2 }} onTyped={(value) => typed.push(value)} />);
    expect([field.selectionStart, field.selectionEnd, field.selectionDirection]).toEqual([2, 9, "backward"]);
    // A value the person typed keeps the browser's caret, whatever `selection` says.
    field.setSelectionRange(3, 3);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(field, "hello world!?");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(typed).toEqual(["hello world!?"]);
    await render(<Shared value="hello world!?" selection={{ anchor: 0, head: 0 }} onTyped={(value) => typed.push(value)} />);
    expect(field.selectionStart).not.toBe(0);
  });

  test("a field without focus, or without a selection to take, is left alone", async () => {
    await render(<Shared value="a" onTyped={() => {}} />);
    const field = container!.querySelector("textarea")!;
    field.setSelectionRange(1, 1);
    await render(<Shared value="ab" selection={{ anchor: 0, head: 0 }} onTyped={() => {}} />);
    expect(field.selectionStart).toBe(2);
    field.focus();
    await render(<Shared value="abc" onTyped={() => {}} />);
    expect(field.selectionStart).toBe(3);
  });
});

describe("ChatComposer, typed together", () => {
  test("says where the person's selection is with each change, draws others' carets, and reports a moved caret", async () => {
    const changes: Array<[string, FieldSelection]> = [];
    const selections: Array<FieldSelection> = [];
    await render(
      <ChatComposer
        value="hi"
        onValueChange={(value, selection) => changes.push([value, selection])}
        onSubmit={() => {}}
        collaborators={[{ ...BEN, anchor: 2, head: 2 }]}
        onSelectionChange={(selection) => selections.push(selection)}
      />,
    );
    expect(container!.querySelector(".sui-collaborative-field textarea")).not.toBeNull();
    expect(carets().map((caret) => caret.dataset.name)).toEqual(["ben"]);
    const field = container!.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(field, "hi!");
      field.setSelectionRange(3, 3);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(changes).toEqual([["hi!", { anchor: 3, head: 3 }]]);
    await selectIn(field, 0, 1);
    expect(selections.at(-1)).toEqual({ anchor: 0, head: 1 });
  });

  test("read-only shows the draft and the carets, without Send, and never sends", async () => {
    const sent: Array<string> = [];
    await render(
      <ChatComposer value="draft" onValueChange={() => {}} onSubmit={(value) => void sent.push(value)} readOnly collaborators={[BEN]} />,
    );
    const field = container!.querySelector("textarea")!;
    expect(field.readOnly).toBe(true);
    expect(container!.querySelector('button[type="submit"]')).toBeNull();
    await act(async () => {
      container!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(sent).toEqual([]);
  });

  test("without collaborators it is the field it always was", async () => {
    await render(<ChatComposer value="x" onValueChange={() => {}} onSubmit={() => {}} />);
    expect(container!.querySelector(".sui-collaborative-field")).toBeNull();
    expect(container!.querySelector('button[type="submit"]')).not.toBeNull();
  });
});

describe("NeedsYouCard, answered together", () => {
  test("its field draws the other devices' carets and says where the selection is", async () => {
    const changes: Array<[string, FieldSelection]> = [];
    const selections: Array<FieldSelection> = [];
    await render(
      <NeedsYouCard
        kind="question"
        prompt="Which branch?"
        value="docs"
        onValueChange={(value, selection) => changes.push([value, selection])}
        onAnswer={() => {}}
        collaborators={[{ ...BEN, anchor: 4, head: 4 }]}
        onSelectionChange={(selection) => selections.push(selection)}
      />,
    );
    expect(container!.querySelector(".sui-collaborative-field input")).not.toBeNull();
    expect(mirror()!.textContent).toBe("docsben​");
    const field = container!.querySelector("input")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(field, "docs-v2");
      field.setSelectionRange(7, 7);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(changes).toEqual([["docs-v2", { anchor: 7, head: 7 }]]);
    await selectIn(field, 0, 4);
    expect(selections.at(-1)).toEqual({ anchor: 0, head: 4 });
  });
});
