/** @jsxImportSource react */
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChatComposer } from "../src/chat/ChatComposer";
import { type ChatComposerCompletions, clampHighlight, CompletionList } from "../src/chat/CompletionList";
import { SMITHERS_UI_STYLE_ATTR } from "../src/index";

/**
 * The composer's completions: a controlled listbox above the input. Every case drives real KeyboardEvents and
 * pointer events through the real DOM and reads what the host's callbacks received and what the DOM says to
 * assistive technology.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean; }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root) {
    const current = root;
    await act(async () => current.unmount());
    root = undefined;
  }
  container?.remove();
  container = undefined;
  document.querySelectorAll(`style[${SMITHERS_UI_STYLE_ATTR}]`).forEach((element) => element.remove());
});

type Call = readonly [string, ...Array<unknown>];

/** A host that records every callback; `highlighted` and `items` are what it passes. */
const host = (highlighted = 0, items = ["/theme", "/help", "/clone"]) => {
  const calls: Array<Call> = [];
  const completions: ChatComposerCompletions = {
    label: "Commands",
    items: items.map((label, index) => ({ id: `row-${index}`, label, detail: index === 1 ? undefined : index === 2 ? null : `${label} detail` })),
    highlighted,
    onHighlight: (index) => calls.push(["highlight", index]),
    onChoose: (index, how) => calls.push(["choose", index, how]),
    onDismiss: () => calls.push(["dismiss"]),
  };
  return { calls, completions };
};

async function render(props: { completions?: ChatComposerCompletions; onStop?: () => void; submitted?: Array<string>; busy?: boolean; readOnly?: boolean }) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const current = root;
  await act(async () =>
    current.render(
      <ChatComposer
        value="/"
        onValueChange={() => {}}
        onSubmit={(value) => void props.submitted?.push(value)}
        lifecycleStatus={props.busy ? "streaming" : "ready"}
        onStop={props.onStop}
        completions={props.completions}
        readOnly={props.readOnly}
      />,
    )
  );
}

const textarea = () => container!.querySelector("textarea")!;
const listbox = () => container!.querySelector<HTMLElement>('[role="listbox"]');
const options = () => [...container!.querySelectorAll<HTMLElement>('[role="option"]')];

async function press(key: string, init: KeyboardEventInit = {}): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  await act(async () => {
    textarea().dispatchEvent(event);
  });
  return event;
}

describe("ChatComposer completions", () => {
  test("read-only drafts do not invoke completion callbacks from the keyboard", async () => {
    const { calls, completions } = host();
    const submitted: string[] = [];
    await render({ completions, readOnly: true, submitted });
    for (const key of ["Enter", "Tab", "ArrowDown", "ArrowUp", "Escape"]) await press(key);
    expect(calls).toEqual([]);
    expect(submitted).toEqual([]);
    expect(textarea().value).toBe("/");
    expect(textarea().readOnly).toBe(true);
  });

  test("read-only drafts offer no pointer completion that can change the draft", async () => {
    const { calls, completions } = host();
    await render({ completions, readOnly: true });
    await act(async () => {
      for (const option of options()) {
        option.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        option.click();
      }
    });
    expect(calls).toEqual([]);
    expect(listbox()).toBeNull();
    for (const name of ["aria-autocomplete", "aria-haspopup", "aria-controls", "aria-activedescendant"]) {
      expect(textarea().getAttribute(name)).toBeNull();
    }
  });

  test("rows show as a labelled listbox the input points at, with the highlighted row selected", async () => {
    const { completions } = host(1);
    await render({ completions });
    const list = listbox()!;
    expect(list.getAttribute("aria-label")).toBe("Commands");
    expect(options().map((option) => option.textContent)).toEqual(["/theme/theme detail", "/help", "/clone"]);
    // No detail, absent or null: no second column.
    expect(options().map((option) => option.querySelectorAll(".sui-completion-detail").length)).toEqual([1, 0, 0]);
    expect(options().map((option) => option.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(options()[1]!.getAttribute("data-highlighted")).toBe("true");
    const input = textarea();
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-haspopup")).toBe("listbox");
    expect(input.getAttribute("aria-controls")).toBe(list.id);
    expect(input.getAttribute("aria-activedescendant")).toBe(options()[1]!.id);
    // Still a textbox: the composer's role and name don't change while it completes.
    expect(input.getAttribute("role")).toBeNull();
  });

  test("ArrowDown and ArrowUp move the highlight, wrapping at both ends", async () => {
    const last = host(2);
    await render({ completions: last.completions });
    expect((await press("ArrowDown")).defaultPrevented).toBe(true);
    expect((await press("ArrowUp")).defaultPrevented).toBe(true);
    expect(last.calls).toEqual([["highlight", 0], ["highlight", 1]]);
  });

  test("ArrowUp from the first row wraps to the last", async () => {
    const first = host(0);
    await render({ completions: first.completions });
    await press("ArrowUp");
    expect(first.calls).toEqual([["highlight", 2]]);
  });

  test("Enter accepts and Tab completes the highlighted row, and neither submits the form", async () => {
    const { calls, completions } = host(1);
    const submitted: Array<string> = [];
    await render({ completions, submitted });
    expect((await press("Enter")).defaultPrevented).toBe(true);
    expect((await press("Tab")).defaultPrevented).toBe(true);
    expect(calls).toEqual([["choose", 1, "accept"], ["choose", 1, "complete"]]);
    expect(submitted).toEqual([]);
  });

  test("Escape dismisses the list before it reaches Stop or the page", async () => {
    const { calls, completions } = host();
    const stops: Array<true> = [];
    await render({ completions, busy: true, onStop: () => stops.push(true) });
    expect((await press("Escape")).defaultPrevented).toBe(true);
    expect(calls).toEqual([["dismiss"]]);
    expect(stops).toEqual([]);
  });

  test("Shift+Enter, Shift+Tab, a modified key and other keys stay the composer's", async () => {
    const { calls, completions } = host();
    await render({ completions });
    for (const [key, init] of [
      ["Enter", { shiftKey: true }],
      ["Tab", { shiftKey: true }],
      ["ArrowDown", { metaKey: true }],
      ["ArrowDown", { ctrlKey: true }],
      ["Enter", { altKey: true }],
      ["a", {}],
    ] as const) {
      expect((await press(key, init)).defaultPrevented, `${key} ${JSON.stringify(init)}`).toBe(key === "Enter" && "altKey" in init);
    }
    expect(calls).toEqual([]);
  });

  test("keys during an IME composition are the composition's", async () => {
    const { calls, completions } = host();
    await render({ completions });
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    Object.defineProperty(event, "isComposing", { value: true });
    await act(async () => {
      textarea().dispatchEvent(event);
    });
    expect(calls).toEqual([]);
  });

  test("the pointer highlights a row it moves over, and a click accepts it without taking focus", async () => {
    const { calls, completions } = host(0);
    await render({ completions });
    const [first, second] = options();
    await act(async () => {
      first!.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      second!.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    });
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => {
      second!.dispatchEvent(down);
      second!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(down.defaultPrevented).toBe(true);
    // Moving over the row already highlighted changes nothing.
    expect(calls).toEqual([["highlight", 1], ["choose", 1, "accept"]]);
  });

  test("no rows: no list, nothing for the input to point at, and the composer's own keys", async () => {
    const { calls, completions } = host(0, []);
    const submitted: Array<string> = [];
    await render({ completions: { ...completions }, submitted });
    expect(listbox()).toBeNull();
    const input = textarea();
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-controls")).toBeNull();
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    await press("Enter");
    expect(submitted).toEqual(["/"]);
    expect(calls).toEqual([]);
  });

  test("without completions the input declares none", async () => {
    await render({});
    const input = textarea();
    expect(listbox()).toBeNull();
    for (const name of ["aria-autocomplete", "aria-haspopup", "aria-controls", "aria-activedescendant"]) {
      expect(input.getAttribute(name)).toBeNull();
    }
  });

  test("typing reaches the host while the list shows, which decides the next rows", async () => {
    const typed: Array<string> = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const current = root;
    await act(async () =>
      current.render(<ChatComposer value="/" onValueChange={(value) => typed.push(value)} onSubmit={() => {}} completions={host().completions} />)
    );
    const input = textarea();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "/th");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(typed).toEqual(["/th"]);
  });

  test("a highlight out of range points at the nearest row", async () => {
    const { completions } = host(9);
    await render({ completions });
    expect(textarea().getAttribute("aria-activedescendant")).toBe(options()[2]!.id);
  });
});

describe("CompletionList", () => {
  test("renders on its own with a class, and clamps its highlight", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const current = root;
    const { completions } = host(-3);
    await act(async () => current.render(<CompletionList id="list" className="mine" completions={completions} />));
    const list = listbox()!;
    expect(list.id).toBe("list");
    expect(list.className).toBe("sui-completion-list mine");
    expect(options()[0]!.id).toBe("list-option-0");
    expect(options()[0]!.getAttribute("aria-selected")).toBe("true");
  });

  test("clampHighlight keeps an index inside the rows, and 0 for none or a non-number", () => {
    expect(clampHighlight(1, 3)).toBe(1);
    expect(clampHighlight(5, 3)).toBe(2);
    expect(clampHighlight(-1, 3)).toBe(0);
    expect(clampHighlight(1.7, 3)).toBe(1);
    expect(clampHighlight(Number.NaN, 3)).toBe(0);
    expect(clampHighlight(2, 0)).toBe(0);
  });
});
