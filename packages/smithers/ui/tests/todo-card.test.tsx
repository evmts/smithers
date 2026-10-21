/** @jsxImportSource react */
// TodoCard under happy-dom: real createRoot + act, native events.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SMITHERS_UI_STYLE_ATTR, TodoCard, type TodoCardProps, type TodoPending, type TodoState } from "../src/index";
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
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  await act(async () => mounted.render(element));
}

async function rerender(element: ReactElement): Promise<void> {
  await act(async () => root!.render(element));
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
}

async function press(key: string): Promise<boolean> {
  let followed = true;
  await act(async () => {
    followed = document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  return followed;
}

const BASE: TodoCardProps = {
  number: 4,
  title: "Retry webhook delivery",
  state: "working",
  prompt: "Retry a failed **webhook** delivery three times.",
};

const card = () => container!.querySelector<HTMLElement>("article[data-slot=todo-card]")!;
const labels = () => [...card().querySelectorAll<HTMLButtonElement>("button")].map((b) => b.textContent);
const button = (name: string) => [...card().querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === name)!;

describe("TodoCard: header and body", () => {
  test("an article named by its title heading, with the number, state chip and data attributes", async () => {
    await render(<TodoCard {...BASE} id="card" className="extra" />);
    const heading = document.getElementById(card().getAttribute("aria-labelledby")!)!;
    expect([heading.tagName, heading.textContent]).toEqual(["H2", "Retry webhook delivery"]);
    expect(card().querySelector(".sui-todo-number")!.textContent).toBe("T4");
    const chip = card().querySelector<HTMLElement>(".sui-todo-state")!;
    expect([chip.textContent, chip.dataset.state]).toEqual(["Working", "working"]);
    expect(chip.className).toContain("sui-badge-default");
    expect(chip.querySelector(".sui-status-dot")).not.toBeNull();
    expect([card().dataset.state, card().id, card().className]).toEqual(["working", "card", "sui-todo-card extra"]);
    expect(card().hasAttribute("data-pending")).toBe(false);
    expect(card().querySelector(".sui-todo-pending")).toBeNull();
  });

  test("an unnumbered TODO shows T–, and a pending one its chip", async () => {
    await render(<TodoCard {...BASE} number={null} state="queued" pending="requested" />);
    expect(card().querySelector(".sui-todo-number")!.textContent).toBe("T–");
    const pending = card().querySelector<HTMLElement>(".sui-todo-pending")!;
    expect([pending.textContent, card().dataset.pending]).toEqual(["Requested", "requested"]);
    expect(pending.className).toContain("sui-badge-muted");
    await rerender(<TodoCard {...BASE} pending="not_sent" />);
    expect(card().querySelector(".sui-todo-pending")!.textContent).toBe("Not sent");
    expect(card().querySelector(".sui-todo-pending")!.className).toContain("sui-badge-destructive");
  });

  test("the prompt renders as Markdown", async () => {
    await render(<TodoCard {...BASE} prompt={"Retry **three** times.\n\n- once\n- twice"} />);
    const prompt = card().querySelector<HTMLElement>("[data-slot=markdown]")!;
    expect(prompt.querySelector("strong")!.textContent).toBe("three");
    expect([...prompt.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["once", "twice"]);
  });

  test("the prompt is untrusted text: no tag in it becomes an element and no unsafe link gets an href", async () => {
    const prompt = [
      "<script>window.__todoCardRan = true</script>",
      '<img src="https://evil.example/x.png" onerror="window.__todoCardRan = true">',
      "<iframe src=\"https://evil.example\"></iframe>",
      "[click](javascript:alert(1))",
    ].join("\n\n");
    await render(<TodoCard {...BASE} prompt={prompt} />);
    expect(card().querySelectorAll("script, img, iframe, [onerror], [src]")).toHaveLength(0);
    const link = card().querySelector<HTMLAnchorElement>("[data-slot=markdown] a")!;
    expect([link.textContent, link.hasAttribute("href")]).toEqual(["click", false]);
    expect((globalThis as { __todoCardRan?: boolean }).__todoCardRan).toBeUndefined();
  });

  test("acceptance criteria list under the prompt, in order; absent or empty shows none", async () => {
    await render(<TodoCard {...BASE} acceptance={["Retries three times", "Logs each attempt"]} />);
    const list = card().querySelector<HTMLUListElement>(".sui-todo-acceptance ul")!;
    expect(document.getElementById(list.getAttribute("aria-labelledby")!)!.textContent).toBe("Acceptance criteria");
    expect([...list.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Retries three times", "Logs each attempt"]);
    const order = [...card().children].map((child) => child.className.split(" ")[0]);
    expect(order).toEqual(["sui-todo-card-header", "sui-md", "sui-todo-acceptance"]);
    await rerender(<TodoCard {...BASE} acceptance={[]} />);
    expect(card().querySelector(".sui-todo-acceptance")).toBeNull();
    await rerender(<TodoCard {...BASE} />);
    expect(card().querySelector(".sui-todo-acceptance")).toBeNull();
  });
});

describe("TodoCard: Drop", () => {
  test("Drop shows in the footer unless the TODO is merged, dropped, pending or unnumbered, or onDrop is absent", async () => {
    const noop = () => {};
    await render(<TodoCard {...BASE} />);
    const cases: ReadonlyArray<[TodoState, TodoPending | undefined, number | null, boolean]> = [
      ["queued", undefined, 4, true],
      ["starting", undefined, 4, true],
      ["working", undefined, 4, true],
      ["needs_you", undefined, 4, true],
      ["in_review", undefined, 4, true],
      ["failed", undefined, 4, true],
      ["merged", undefined, 4, false],
      ["dropped", undefined, 4, false],
      ["working", "requested", 4, false],
      ["working", "not_sent", 4, false],
      ["queued", undefined, null, false],
    ];
    for (const [state, pending, number, shown] of cases) {
      await rerender(<TodoCard {...BASE} state={state} pending={pending} number={number} onDrop={noop} />);
      expect({ state, pending, number, buttons: labels() }).toEqual({ state, pending, number, buttons: shown ? ["Drop"] : [] });
      expect(card().querySelector("footer") !== null).toBe(shown);
    }
    await rerender(<TodoCard {...BASE} />);
    expect(labels()).toEqual([]);
    expect(card().querySelector("footer")).toBeNull();
  });

  test("Drop asks once inline; Cancel and Escape put it back, focused", async () => {
    let dropped = 0;
    await render(<TodoCard {...BASE} onDrop={() => (dropped += 1)} />);
    await click(button("Drop"));
    expect(labels()).toEqual(["Drop T4", "Cancel"]);
    expect(document.activeElement).toBe(button("Cancel"));
    await click(button("Cancel"));
    expect(labels()).toEqual(["Drop"]);
    expect(document.activeElement).toBe(button("Drop"));
    await click(button("Drop"));
    expect(await press("Escape")).toBe(false);
    expect(labels()).toEqual(["Drop"]);
    expect(document.activeElement).toBe(button("Drop"));
    expect(dropped).toBe(0);
  });

  test("Drop T4 calls onDrop once, puts Drop back and focuses the heading", async () => {
    let dropped = 0;
    await render(<TodoCard {...BASE} onDrop={() => (dropped += 1)} />);
    await click(button("Drop"));
    await click(button("Drop T4"));
    expect(dropped).toBe(1);
    expect(labels()).toEqual(["Drop"]);
    expect(document.activeElement).toBe(card().querySelector("h2"));
    await rerender(<TodoCard {...BASE} pending="requested" onDrop={() => (dropped += 1)} />);
    expect(labels()).toEqual([]);
    expect(document.activeElement).toBe(card().querySelector("h2"));
  });
});
