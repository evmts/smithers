/** @jsxImportSource react */
// StackList under happy-dom: real createRoot + act, native events, so default-prevented flags are the browser's.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  SMITHERS_UI_STYLE_ATTR,
  smithersUiCss,
  StackList,
  type StackListTodo,
  stackCss,
  TODO_PENDING_WORDS,
  TODO_STATE_WORDS,
  todoNumberText,
  type TodoState,
} from "../src/index";
import { installDarkThemeStyles, removeDarkThemeStyles } from "./theme-test-utils";
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
  removeDarkThemeStyles();
  document.documentElement.removeAttribute("data-theme");
});

async function render(element: ReactElement): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  await act(async () => mounted.render(element));
}

async function rerender(element: ReactElement): Promise<void> {
  await act(async () => root!.render(element));
}

/** Clicks `el` like a browser, returning whether the default action still runs. */
async function click(el: Element, init: MouseEventInit = {}): Promise<boolean> {
  let followed = true;
  await act(async () => {
    followed = el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
  });
  return followed;
}

/** Presses a key on the focused element, returning whether its default action still runs. */
async function press(key: string, init: KeyboardEventInit = {}): Promise<boolean> {
  let followed = true;
  await act(async () => {
    followed = document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });
  return followed;
}

const TODOS: ReadonlyArray<StackListTodo> = [
  { id: "t4", number: 4, title: "Retry webhook delivery", state: "working" },
  { id: "t5", number: 5, title: "Add rate limit headers", state: "queued" },
  { id: "draft-1", number: null, title: "Fix flaky test", state: "queued", pending: "requested" },
  { id: "t6", number: 6, title: "Bump dependencies", state: "in_review", pending: "not_sent" },
  { id: "t7", number: 7, title: "Cache the tree", state: "failed" },
  { id: "t3", number: 3, title: "Fix README typo", state: "merged" },
  { id: "t2", number: 2, title: "Rewrite in Rust", state: "dropped" },
];

const section = () => container!.querySelector<HTMLElement>("section[data-slot=stack-list]")!;
const rows = () => [...container!.querySelectorAll<HTMLElement>("li[data-todo]")];
const row = (id: string) => rows().find((candidate) => candidate.dataset.todo === id)!;
const buttonsIn = (el: Element) => [...el.querySelectorAll<HTMLButtonElement>("button")].map((b) => b.textContent);
const button = (el: Element, name: string) =>
  [...el.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => candidate.textContent === name)!;
const linkHref = (todo: StackListTodo) => (todo.number === null ? undefined : `/octocat/hello/stack/${todo.number}`);

describe("StackList: rows", () => {
  test("rows render in the order given with their number, title, state and pending chips", async () => {
    await render(<StackList repo="octocat/hello" todos={TODOS} />);
    expect(section().getAttribute("aria-label")).toBe("octocat/hello stack");
    expect(rows().map((shown) => shown.dataset.todo)).toEqual(["t4", "t5", "draft-1", "t6", "t7", "t3", "t2"]);
    expect(rows().map((shown) => shown.querySelector(".sui-todo-number")!.textContent)).toEqual([
      "T4",
      "T5",
      "T–",
      "T6",
      "T7",
      "T3",
      "T2",
    ]);
    expect(rows().map((shown) => shown.querySelector(".sui-stack-title")!.textContent)).toEqual(TODOS.map((t) => t.title));
    expect(rows().map((shown) => shown.dataset.state)).toEqual(TODOS.map((t) => t.state));
    expect(rows().map((shown) => shown.dataset.pending ?? null)).toEqual([null, null, "requested", "not_sent", null, null, null]);
    expect(rows().map((shown) => shown.querySelector(".sui-todo-state")!.textContent)).toEqual([
      "Working",
      "Queued",
      "Queued",
      "In review",
      "Failed",
      "Merged",
      "Dropped",
    ]);
  });

  test("the list is an ordered list named Stack by the section's heading", async () => {
    await render(<StackList repo="octocat/hello" todos={TODOS} />);
    const list = section().querySelector("ol")!;
    const heading = document.getElementById(list.getAttribute("aria-labelledby")!)!;
    expect([heading.tagName, heading.textContent]).toEqual(["H2", "Stack"]);
    expect(heading.closest("header")).not.toBeNull();
    expect(list.children).toHaveLength(TODOS.length);
    expect([...list.children].every((child) => child.tagName === "LI")).toBe(true);
  });

  test("each state shows its word in its badge variant, and only Working carries the status dot", async () => {
    const expected: Record<TodoState, [string, string]> = {
      queued: ["Queued", "sui-badge-outline"],
      starting: ["Starting", "sui-badge-outline"],
      working: ["Working", "sui-badge-default"],
      needs_you: ["Needs you", "sui-badge-warning"],
      in_review: ["In review", "sui-badge-default"],
      merged: ["Merged", "sui-badge-success"],
      dropped: ["Dropped", "sui-badge-muted"],
      failed: ["Failed", "sui-badge-destructive"],
    };
    const states = Object.keys(expected) as Array<TodoState>;
    await render(
      <StackList repo="r" todos={states.map((state, index) => ({ id: state, number: index + 1, title: state, state }))} />,
    );
    for (const state of states) {
      const chip = row(state).querySelector<HTMLElement>(".sui-todo-state")!;
      expect([state, chip.textContent, chip.dataset.state, TODO_STATE_WORDS[state]]).toEqual([
        state,
        expected[state][0],
        state,
        expected[state][0],
      ]);
      expect(chip.className).toContain(expected[state][1]);
      expect(chip.querySelector(".sui-status-dot") !== null).toBe(state === "working");
    }
  });

  test("a pending row shows Requested muted or Not sent destructive; others show no chip", async () => {
    await render(<StackList repo="r" todos={TODOS} />);
    const chip = (id: string) => row(id).querySelector<HTMLElement>(".sui-todo-pending");
    expect([chip("draft-1")!.textContent, TODO_PENDING_WORDS.requested]).toEqual(["Requested", "Requested"]);
    expect(chip("draft-1")!.className).toContain("sui-badge-muted");
    expect([chip("t6")!.textContent, TODO_PENDING_WORDS.not_sent]).toEqual(["Not sent", "Not sent"]);
    expect(chip("t6")!.className).toContain("sui-badge-destructive");
    expect(chip("t4")).toBeNull();
  });

  test("todoNumberText reads T<n>, or T– before the stack numbers it", () => {
    expect([todoNumberText(4), todoNumberText(1), todoNumberText(null)]).toEqual(["T4", "T1", "T–"]);
  });

  test("rows are keyed by id, so a T– row keeps its element when the stack numbers it", async () => {
    await render(<StackList repo="r" todos={TODOS.slice(2, 3)} />);
    const before = rows()[0]!;
    await rerender(
      <StackList repo="r" todos={[TODOS[0]!, { id: "draft-1", number: 8, title: "Fix flaky test", state: "queued" }]} />,
    );
    expect(rows()[1]).toBe(before);
    expect(before.querySelector(".sui-todo-number")!.textContent).toBe("T8");
    expect(before.querySelector(".sui-todo-pending")).toBeNull();
    expect(before.hasAttribute("data-pending")).toBe(false);
  });

  test("the selected row alone carries aria-current", async () => {
    await render(<StackList repo="r" todos={TODOS} selected="t5" />);
    expect(rows().map((shown) => shown.getAttribute("aria-current"))).toEqual([null, "true", null, null, null, null, null]);
    await rerender(<StackList repo="r" todos={TODOS} />);
    expect(rows().some((shown) => shown.hasAttribute("aria-current"))).toBe(false);
  });

  test("passes section props through and names its data-slot", async () => {
    await render(<StackList repo="r" todos={TODOS} id="stack" className="extra" data-repo="r" />);
    expect([section().id, section().className, section().dataset.repo]).toEqual(["stack", "sui-stack-list extra", "r"]);
    expect(rows().every((shown) => shown.dataset.slot === "stack-row")).toBe(true);
  });
});

describe("StackList: links", () => {
  test("href makes each title a link; undefined or an unsafe scheme leaves plain text", async () => {
    const href = (todo: StackListTodo) => (todo.id === "t5" ? "javascript:alert(1)" : linkHref(todo));
    await render(<StackList repo="r" todos={TODOS} href={href} />);
    const link = row("t4").querySelector<HTMLAnchorElement>("a.sui-stack-title")!;
    expect([link.getAttribute("href"), link.textContent]).toEqual(["/octocat/hello/stack/4", "Retry webhook delivery"]);
    expect(row("t5").querySelector("a, [href]")).toBeNull();
    expect(row("t5").querySelector(".sui-stack-title")!.textContent).toBe("Add rate limit headers");
    expect(row("draft-1").querySelector("a")).toBeNull();
    expect(row("t3").querySelector("a")!.getAttribute("href")).toBe("/octocat/hello/stack/3");
  });

  test("a plain click navigates in-app and prevents the default; a modified click is the browser's", async () => {
    const seen: Array<[string, string]> = [];
    await render(
      <StackList repo="r" todos={TODOS} href={linkHref} onNavigate={(todo, href) => seen.push([todo.id, href])} />,
    );
    const link = () => row("t4").querySelector("a")!;
    expect(await click(link())).toBe(false);
    expect(seen).toEqual([["t4", "/octocat/hello/stack/4"]]);
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(await click(link(), modifier)).toBe(true);
    }
    expect(seen).toHaveLength(1);
  });

  test("without onNavigate a click follows the link", async () => {
    await render(<StackList repo="r" todos={TODOS} href={linkHref} />);
    expect(await click(row("t4").querySelector("a")!)).toBe(true);
  });
});

describe("StackList: Drop", () => {
  test("Drop shows only on numbered rows that aren't merged, dropped or pending", async () => {
    await render(<StackList repo="r" todos={TODOS} onDrop={() => {}} />);
    expect(rows().map((shown) => [shown.dataset.todo, buttonsIn(shown)])).toEqual([
      ["t4", ["Drop"]],
      ["t5", ["Drop"]],
      ["draft-1", []],
      ["t6", []],
      ["t7", ["Drop"]],
      ["t3", []],
      ["t2", []],
    ]);
    for (const drop of container!.querySelectorAll<HTMLButtonElement>("button")) {
      expect([drop.type, drop.disabled, drop.dataset.slot]).toEqual(["button", false, "todo-drop"]);
    }
  });

  test("without onDrop no row has a button", async () => {
    await render(<StackList repo="r" todos={TODOS} />);
    expect(container!.querySelectorAll("button")).toHaveLength(0);
  });

  test("Drop asks once inline: Drop T4 and Cancel replace it, and focus moves to Cancel", async () => {
    const dropped: Array<StackListTodo> = [];
    await render(<StackList repo="r" todos={TODOS} onDrop={(todo) => dropped.push(todo)} />);
    await click(button(row("t4"), "Drop"));
    expect(buttonsIn(row("t4"))).toEqual(["Drop T4", "Cancel"]);
    expect(button(row("t4"), "Drop T4").className).toContain("sui-button-destructive");
    expect(document.activeElement).toBe(button(row("t4"), "Cancel"));
    expect(buttonsIn(row("t5"))).toEqual(["Drop"]);
    expect(dropped).toEqual([]);
  });

  test("Cancel puts Drop back, focused, and drops nothing", async () => {
    const dropped: Array<StackListTodo> = [];
    await render(<StackList repo="r" todos={TODOS} onDrop={(todo) => dropped.push(todo)} />);
    await click(button(row("t4"), "Drop"));
    await click(button(row("t4"), "Cancel"));
    expect(buttonsIn(row("t4"))).toEqual(["Drop"]);
    expect(document.activeElement).toBe(button(row("t4"), "Drop"));
    expect(dropped).toEqual([]);
  });

  test("Escape puts Drop back, focused, and stops at the confirm", async () => {
    const dropped: Array<StackListTodo> = [];
    const escapes: Array<string> = [];
    const listener = (event: KeyboardEvent) => escapes.push(event.key);
    document.addEventListener("keydown", listener);
    try {
      await render(<StackList repo="r" todos={TODOS} onDrop={(todo) => dropped.push(todo)} />);
      await click(button(row("t4"), "Drop"));
      expect(await press("Escape")).toBe(false);
      expect(buttonsIn(row("t4"))).toEqual(["Drop"]);
      expect(document.activeElement).toBe(button(row("t4"), "Drop"));
      expect(escapes).toEqual([]);
      expect(dropped).toEqual([]);
    } finally {
      document.removeEventListener("keydown", listener);
    }
  });

  test("Drop T4 calls onDrop once with the row, puts Drop back and focuses the row's title", async () => {
    const dropped: Array<StackListTodo> = [];
    await render(<StackList repo="r" todos={TODOS} href={linkHref} onDrop={(todo) => dropped.push(todo)} />);
    await click(button(row("t4"), "Drop"));
    await click(button(row("t4"), "Drop T4"));
    expect(dropped).toEqual([TODOS[0]!]);
    expect(buttonsIn(row("t4"))).toEqual(["Drop"]);
    expect(document.activeElement).toBe(row("t4").querySelector("a"));
  });

  test("when the host marks the dropped row Requested, Drop goes and focus stays on the row", async () => {
    const todos = [...TODOS];
    await render(<StackList repo="r" todos={todos} onDrop={() => {}} />);
    await click(button(row("t5"), "Drop"));
    await click(button(row("t5"), "Drop T5"));
    expect(document.activeElement).toBe(row("t5"));
    todos[1] = { ...todos[1]!, pending: "requested" };
    await rerender(<StackList repo="r" todos={todos} onDrop={() => {}} />);
    expect(buttonsIn(row("t5"))).toEqual([]);
    expect(document.activeElement).toBe(row("t5"));
  });

  test("one row confirms at a time", async () => {
    await render(<StackList repo="r" todos={TODOS} onDrop={() => {}} />);
    await click(button(row("t4"), "Drop"));
    await click(button(row("t5"), "Drop"));
    expect(buttonsIn(row("t4"))).toEqual(["Drop"]);
    expect(buttonsIn(row("t5"))).toEqual(["Drop T5", "Cancel"]);
  });

  test("a confirming row that merges meanwhile loses Drop and its confirm", async () => {
    const todos = [...TODOS];
    await render(<StackList repo="r" todos={todos} onDrop={() => {}} />);
    await click(button(row("t4"), "Drop"));
    todos[0] = { ...todos[0]!, state: "merged" };
    await rerender(<StackList repo="r" todos={todos} onDrop={() => {}} />);
    expect(buttonsIn(row("t4"))).toEqual([]);
  });
});

describe("StackList: keyboard", () => {
  test("ArrowDown, ArrowUp, Home and End move focus between rows' links, or the row when it has none", async () => {
    await render(<StackList repo="r" todos={TODOS} href={linkHref} onDrop={() => {}} />);
    const target = (id: string): HTMLElement => row(id).querySelector("a") ?? row(id);
    target("t4").focus();
    expect(document.activeElement).toBe(target("t4"));
    expect(await press("ArrowDown")).toBe(false);
    expect(document.activeElement).toBe(target("t5"));
    await press("ArrowDown");
    // The T– row has no link, so the row itself takes focus.
    expect(document.activeElement).toBe(row("draft-1"));
    expect(row("draft-1").tabIndex).toBe(0);
    await press("ArrowDown");
    expect(document.activeElement).toBe(target("t6"));
    await press("ArrowUp");
    expect(document.activeElement).toBe(row("draft-1"));
    expect(await press("End")).toBe(false);
    expect(document.activeElement).toBe(target("t2"));
    await press("ArrowDown");
    expect(document.activeElement).toBe(target("t2"));
    expect(await press("Home")).toBe(false);
    expect(document.activeElement).toBe(target("t4"));
    await press("ArrowUp");
    expect(document.activeElement).toBe(target("t4"));
  });

  test("an arrow from a row's Drop moves to the next row's link", async () => {
    await render(<StackList repo="r" todos={TODOS} href={linkHref} onDrop={() => {}} />);
    button(row("t4"), "Drop").focus();
    await press("ArrowDown");
    expect(document.activeElement).toBe(row("t5").querySelector("a"));
  });

  test("without href every row is focusable and the arrows move between rows", async () => {
    await render(<StackList repo="r" todos={TODOS} />);
    expect(rows().map((shown) => shown.tabIndex)).toEqual(TODOS.map(() => 0));
    rows()[0]!.focus();
    await press("ArrowDown");
    expect(document.activeElement).toBe(rows()[1]);
    await press("End");
    expect(document.activeElement).toBe(rows()[6]);
  });

  test("a row with a link isn't itself a tab stop, and its link and Drop are", async () => {
    await render(<StackList repo="r" todos={TODOS} href={linkHref} onDrop={() => {}} />);
    expect(row("t4").hasAttribute("tabindex")).toBe(false);
    expect(row("t4").querySelector("a")!.hasAttribute("href")).toBe(true);
    expect(button(row("t4"), "Drop").tabIndex).toBe(0);
  });

  test("modified arrows and other keys keep their default and don't move focus", async () => {
    await render(<StackList repo="r" todos={TODOS} href={linkHref} />);
    const first = row("t4").querySelector("a")!;
    first.focus();
    for (const [key, init] of [
      ["ArrowDown", { shiftKey: true }],
      ["ArrowDown", { altKey: true }],
      ["End", { ctrlKey: true }],
      ["Home", { metaKey: true }],
      ["PageDown", {}],
      ["a", {}],
    ] as const) {
      expect(await press(key, init)).toBe(true);
      expect(document.activeElement).toBe(first);
    }
  });
});

describe("StackList: loading, empty and actions", () => {
  test("loading with no rows shows a status and placeholders, never No TODOs", async () => {
    await render(<StackList repo="r" todos={[]} loading />);
    expect(section().getAttribute("aria-busy")).toBe("true");
    expect(container!.querySelector("[role=status]")!.getAttribute("aria-label")).toBe("Loading stack");
    expect(container!.querySelector("[data-slot=empty-state]")).toBeNull();
    expect(container!.textContent).not.toContain("No TODOs");
    expect(container!.querySelectorAll(".sui-stack-loading [data-slot=skeleton]")).toHaveLength(3);
    expect(container!.querySelector(".sui-stack-loading")!.getAttribute("aria-hidden")).toBe("true");
    await rerender(<StackList repo="r" todos={[]} />);
    expect(section().hasAttribute("aria-busy")).toBe(false);
    expect(container!.querySelector("[role=status]")).toBeNull();
    expect(container!.querySelector("[data-slot=empty-state]")!.textContent).toBe("No TODOs");
    expect(container!.querySelector("ol")).toBeNull();
  });

  test("loading with this device's rows already known shows them beside the status", async () => {
    await render(<StackList repo="r" todos={TODOS.slice(2, 3)} loading />);
    expect(rows()).toHaveLength(1);
    expect(container!.querySelector("[role=status]")).not.toBeNull();
    expect(container!.querySelector(".sui-stack-loading, [data-slot=empty-state]")).toBeNull();
  });

  test("actions render in the header and stay keyboard-reachable", async () => {
    let created = 0;
    await render(
      <StackList
        repo="r"
        todos={TODOS}
        actions={
          <button type="button" onClick={() => (created += 1)}>
            New TODO
          </button>
        }
      />,
    );
    const action = container!.querySelector<HTMLButtonElement>("header .sui-stack-actions button")!;
    expect(action.textContent).toBe("New TODO");
    action.focus();
    expect(document.activeElement).toBe(action);
    await click(action);
    expect(created).toBe(1);
  });
});

describe("StackList: themes and the sheet", () => {
  test("a Needs you chip follows the theme: its color changes between light and dark", async () => {
    installDarkThemeStyles();
    document.documentElement.dataset.theme = "light";
    const todos: ReadonlyArray<StackListTodo> = [{ id: "a", number: 1, title: "A", state: "needs_you" }];
    await render(<StackList repo="r" todos={todos} />);
    const color = () => getComputedStyle(row("a").querySelector(".sui-todo-state")!).color;
    const light = color();
    document.documentElement.dataset.theme = "dark";
    await rerender(<StackList repo="r" todos={todos} id="dark" />);
    const dark = color();
    expect(light).not.toBe("");
    expect(dark).not.toBe("");
    expect(dark).not.toBe(light);
  });

  test("the sheet is composed into the shipped stylesheet and namespaced", () => {
    expect(smithersUiCss).toContain(stackCss.trim());
    expect(stackCss.match(/\.[a-z][\w-]*/g)!.every((name) => name.startsWith(".sui-"))).toBe(true);
    expect(stackCss).toContain(".sui-stack-row[data-state='merged'] .sui-stack-title");
    expect(stackCss).toContain(".sui-stack-row:focus-visible");
  });
});
