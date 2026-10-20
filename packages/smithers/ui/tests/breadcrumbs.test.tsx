/** @jsxImportSource react */
// Breadcrumbs under happy-dom: real createRoot + act, as file-tree.test.tsx does. Clicks are dispatched as native
// MouseEvents so the modifier keys and the default-prevented flag are the browser's own.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { type BreadcrumbItem, Breadcrumbs, SMITHERS_UI_STYLE_ATTR } from "../src/index";
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
    followed = el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
  });
  return followed;
}

const ITEMS: ReadonlyArray<BreadcrumbItem> = [
  { key: "", label: "tinyhttp", href: "#/maya/tinyhttp" },
  { key: "src", label: "src", href: "#/maya/tinyhttp/tree/main/src" },
  { key: "src/router.ts", label: "router.ts", href: "#/maya/tinyhttp/blob/main/src/router.ts" },
];

describe("Breadcrumbs", () => {
  test("links every step but the last, which is the current page", async () => {
    await render(<Breadcrumbs items={ITEMS} />);
    const nav = container!.querySelector("nav")!;
    expect(nav.getAttribute("aria-label")).toBe("Breadcrumb");
    const links = [...nav.querySelectorAll("a")];
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["tinyhttp", "#/maya/tinyhttp"],
      ["src", "#/maya/tinyhttp/tree/main/src"],
    ]);
    const current = nav.querySelector('[aria-current="page"]')!;
    expect(current.textContent).toBe("router.ts");
    expect(current.tagName).toBe("SPAN");
    expect(nav.querySelectorAll('.sui-breadcrumbs-separator[aria-hidden="true"]')).toHaveLength(2);
    expect(document.querySelector(`style[${SMITHERS_UI_STYLE_ATTR}]`)?.textContent).toContain(".sui-breadcrumbs-link");
  });

  test("a plain click navigates in the app; a modified or secondary click is the browser's", async () => {
    const seen: Array<string> = [];
    await render(<Breadcrumbs items={ITEMS} onNavigate={(item) => seen.push(item.key)} aria-label="File path" />);
    expect(container!.querySelector("nav")!.getAttribute("aria-label")).toBe("File path");
    const [repo, src] = [...container!.querySelectorAll("a")];
    expect(await click(src!)).toBe(false);
    expect(await click(repo!)).toBe(false);
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(await click(src!, init)).toBe(true);
    }
    expect(seen).toEqual(["src", ""]);
  });

  test("a click another handler already handled is left alone", async () => {
    const seen: Array<string> = [];
    await render(
      <div onClickCapture={(event) => event.preventDefault()}>
        <Breadcrumbs items={ITEMS} onNavigate={(item) => seen.push(item.key)} />
      </div>,
    );
    await click(container!.querySelector("a")!);
    expect(seen).toEqual([]);
  });

  test("without onNavigate every link is followed; a step without href is plain text", async () => {
    await render(
      <Breadcrumbs items={[{ key: "a", label: "owner" }, { key: "b", label: "repo", href: "#/b" }, { key: "c", label: "file" }]} />,
    );
    expect(await click(container!.querySelector("a")!)).toBe(true);
    const plain = container!.querySelector(".sui-breadcrumbs-item span.sui-breadcrumbs-current")!;
    expect(plain.textContent).toBe("owner");
    expect(plain.hasAttribute("aria-current")).toBe(false);
  });
});
