/** @jsxImportSource react */
// DirectoryListing under happy-dom: real createRoot + act. Clicks are native MouseEvents, so a modified click and
// the default-prevented flag are the browser's own.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { type DirectoryEntry, DirectoryListing, type DirectoryTarget, SMITHERS_UI_STYLE_ATTR } from "../src/index";
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

async function click(el: Element, init: MouseEventInit = {}): Promise<boolean> {
  let followed = true;
  await act(async () => {
    followed = el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
  });
  return followed;
}

const ENTRIES: ReadonlyArray<DirectoryEntry> = [
  { name: "middleware", path: "src/middleware", kind: "directory" },
  { name: "router.ts", path: "src/router.ts", kind: "file" },
];
const href = (target: DirectoryTarget) => `#/${target.kind}/${target.path}`;

describe("DirectoryListing", () => {
  test("lists each entry as a link with its kind's icon, under a parent row", async () => {
    await render(<DirectoryListing entries={ENTRIES} parent="" href={href} />);
    const list = container!.querySelector("ul")!;
    expect(list.getAttribute("aria-label")).toBe("Files");
    const links = [...list.querySelectorAll("a")];
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["..", "#/directory/"],
      ["middleware", "#/directory/src/middleware"],
      ["router.ts", "#/file/src/router.ts"],
    ]);
    expect(links[0]!.getAttribute("aria-label")).toBe("Parent directory");
    expect([...list.querySelectorAll(".sui-dir-icon")].map((icon) => icon.getAttribute("data-kind"))).toEqual([
      "directory",
      "file",
    ]);
    expect(list.querySelector('[data-kind="directory"] .sui-dir-icon')?.getAttribute("aria-hidden")).toBe("true");
  });

  test("a plain click opens in the app; a modified click and a handled click are the browser's", async () => {
    const opened: Array<DirectoryTarget> = [];
    await render(
      <div onClickCapture={(event) => (event.target as Element).textContent === "router.ts" && event.preventDefault()}>
        <DirectoryListing entries={ENTRIES} parent="src" href={href} onOpen={(target) => opened.push(target)} label="src" />
      </div>,
    );
    expect(container!.querySelector("ul")!.getAttribute("aria-label")).toBe("src");
    const [up, middleware, router] = [...container!.querySelectorAll("a")];
    expect(await click(up!)).toBe(false);
    expect(await click(middleware!)).toBe(false);
    expect(await click(middleware!, { metaKey: true })).toBe(true);
    await click(router!.querySelector(".sui-dir-name")!);
    expect(opened).toEqual([
      { path: "src", kind: "directory" },
      { path: "src/middleware", kind: "directory" },
    ]);
  });

  test("with nothing to list it shows the empty content; without empty content, an empty list", async () => {
    await render(<DirectoryListing entries={[]} href={href} empty="Empty repository" />);
    expect(container!.querySelector('[data-slot="directory-listing"]')!.textContent).toBe("Empty repository");
    expect(container!.querySelector("ul")).toBeNull();
    await act(async () => root!.render(<DirectoryListing entries={[]} href={href} />));
    expect(container!.querySelectorAll("li")).toHaveLength(0);
    expect(container!.querySelector("ul")).not.toBeNull();
    await act(async () => root!.render(<DirectoryListing entries={[]} parent="" href={href} empty="Empty" />));
    expect(container!.querySelectorAll("li")).toHaveLength(1);
  });

  test("without onOpen every row is followed", async () => {
    await render(<DirectoryListing entries={ENTRIES} href={href} />);
    expect(await click(container!.querySelector("a")!)).toBe(true);
  });
});
