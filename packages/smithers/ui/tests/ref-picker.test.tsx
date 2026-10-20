/** @jsxImportSource react */
// RefPicker under happy-dom: real createRoot + act, the Popover's portal in document.body, as a browser renders it.
// Clicks and keys are dispatched as native events, so modifier keys and the default-prevented flag are the browser's.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { type RefPickerRefs, RefPicker, SMITHERS_UI_STYLE_ATTR } from "../src/index";
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

/** Clicks `el` like a browser, returning whether the default action still runs. */
async function click(el: Element, init: MouseEventInit = {}): Promise<boolean> {
  let followed = true;
  await act(async () => {
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, ...init }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, ...init }));
    followed = el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
  });
  return followed;
}

async function type(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function key(el: Element, name: string): Promise<boolean> {
  let followed = true;
  await act(async () => {
    followed = el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  });
  return followed;
}

const SHA = (seed: string) => seed.repeat(40).slice(0, 40);
const READY: RefPickerRefs = {
  state: "ready",
  branches: [
    { name: "change-the-title", sha: SHA("f4") },
    { name: "main", sha: SHA("d0") },
    { name: "test-branch", sha: SHA("58") },
  ],
  tags: [{ name: "v1.0.0", sha: SHA("c1") }],
};

const trigger = () => container!.querySelector<HTMLButtonElement>('[data-slot="ref-picker"] button')!;
const panel = () => document.querySelector<HTMLElement>('[data-slot="popover-content"]');
const filter = () => panel()!.querySelector<HTMLInputElement>("input")!;
const links = () => [...panel()!.querySelectorAll<HTMLAnchorElement>("a")].map((link) => [link.textContent, link.getAttribute("href")]);

/** The picker over `refs`, recording each ref chosen. */
async function picker(refs: RefPickerRefs = READY, selected = "main") {
  const chosen: Array<string> = [];
  await render(
    <RefPicker
      current={selected}
      selected={selected}
      refs={refs}
      defaultBranch="main"
      href={(ref) => `/octocat/Spoon-Knife/tree/${ref}/docs`}
      onSelect={(ref) => chosen.push(ref)}
    />,
  );
  return chosen;
}

describe("RefPicker", () => {
  test("a button showing the ref; opened, every branch links with its short SHA, counted on its tab", async () => {
    await picker();
    expect(trigger().textContent).toBe("main");
    expect(panel()).toBeNull();
    await click(trigger());
    expect(panel()!.getAttribute("aria-label")).toBe("Branches and tags");
    expect(filter().getAttribute("aria-label")).toBe("Find a branch, tag or SHA");
    expect(links()).toEqual([
      ["change-the-titlef4f4f4f", "/octocat/Spoon-Knife/tree/change-the-title/docs"],
      ["maindefaultd0d0d0d", "/octocat/Spoon-Knife/tree/main/docs"],
      ["test-branch5858585", "/octocat/Spoon-Knife/tree/test-branch/docs"],
    ]);
    expect(panel()!.querySelector('[aria-current="true"]')!.textContent).toContain("main");
    expect([...panel()!.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual(["Branches3", "Tags1"]);
    expect(document.querySelector(`style[${SMITHERS_UI_STYLE_ATTR}]`)?.textContent).toContain(".sui-ref-picker-item");
    expect(document.querySelector(`style[${SMITHERS_UI_STYLE_ATTR}]`)?.textContent).toContain(".sui-popover-content");
  });

  test("a plain click chooses and closes; a modified click is the browser's", async () => {
    const chosen = await picker();
    await click(trigger());
    const test = panel()!.querySelectorAll("a")[2]!;
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }]) {
      expect(await click(test, init)).toBe(true);
    }
    expect(chosen).toEqual([]);
    expect(await click(test)).toBe(false);
    expect(chosen).toEqual(["test-branch"]);
    expect(panel()).toBeNull();
  });

  test("the filter narrows the list; Enter chooses the first match; nothing matching says so", async () => {
    const chosen = await picker();
    await click(trigger());
    await type(filter(), "TEST");
    expect(links().map(([name]) => name)).toEqual(["test-branch5858585"]);
    await type(filter(), "nope");
    expect(panel()!.textContent).toContain("No match");
    expect(await key(filter(), "Enter")).toBe(true);
    expect(await key(filter(), "ArrowDown")).toBe(true);
    expect(chosen).toEqual([]);
    await type(filter(), "change");
    expect(await key(filter(), "Enter")).toBe(false);
    expect(chosen).toEqual(["change-the-title"]);
    // Choosing clears the filter for the next opening.
    await click(trigger());
    expect(filter().value).toBe("");
  });

  test("a full SHA typed in the filter offers that commit", async () => {
    const chosen = await picker();
    await click(trigger());
    const sha = "ABCDEF0123456789abcdef0123456789abcdef01";
    await type(filter(), sha.slice(0, 39));
    expect(links().some(([, href]) => href?.includes("abcdef0"))).toBe(false);
    await type(filter(), sha);
    expect(links()[0]).toEqual(["abcdef0", `/octocat/Spoon-Knife/tree/${sha.toLowerCase()}/docs`]);
    await key(filter(), "Enter");
    expect(chosen).toEqual([sha.toLowerCase()]);
    await click(trigger());
    await type(filter(), sha);
    await click(panel()!.querySelector("a")!);
    expect(chosen).toEqual([sha.toLowerCase(), sha.toLowerCase()]);
  });

  test("the Tags tab lists the tags, and Enter there chooses a tag", async () => {
    const chosen = await picker();
    await click(trigger());
    const tags = panel()!.querySelectorAll<HTMLElement>('[role="tab"]')[1]!;
    await click(tags);
    expect(tags.getAttribute("aria-selected")).toBe("true");
    expect(links()).toEqual([["v1.0.0c1c1c1c", "/octocat/Spoon-Knife/tree/v1.0.0/docs"]]);
    await key(filter(), "Enter");
    expect(chosen).toEqual(["v1.0.0"]);
  });

  test("Escape closes it and forgets the filter", async () => {
    await picker();
    await click(trigger());
    await type(filter(), "main");
    await key(filter(), "Escape");
    expect(panel()).toBeNull();
    await click(trigger());
    expect(filter().value).toBe("");
  });

  test("loading shows a spinner, a failure says why, and a cut list says more aren't shown", async () => {
    await picker({ state: "loading" });
    await click(trigger());
    expect(panel()!.querySelector('[role="tab"]')).toBeNull();
    expect(panel()!.querySelector(".sui-ref-picker-note")).not.toBeNull();
    await act(async () => root!.unmount());
    root = undefined;
    container!.remove();
    await picker({ state: "failed", message: "Code Storage is busy" });
    await click(trigger());
    expect(panel()!.querySelector('[role="alert"]')!.textContent).toBe("Code Storage is busy");
    await act(async () => root!.unmount());
    root = undefined;
    container!.remove();
    await picker({ ...READY, truncated: true }, "d0d0d0d");
    await click(trigger());
    expect(panel()!.textContent).toContain("More not shown");
    expect(panel()!.querySelector('[aria-current="true"]')).toBeNull();
    expect(await key(filter(), "Enter")).toBe(false);
  });
});
