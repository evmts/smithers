/** @jsxImportSource react */
// IssuesView under happy-dom: real createRoot + act.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IssuesView, issuesViewCss, type IssuesViewIssue } from "../src/issues-view";
import { SMITHERS_UI_STYLE_ATTR } from "../src/styles";
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

const ISSUES: ReadonlyArray<IssuesViewIssue> = [
  {
    number: 12,
    title: "Router drops trailing slash",
    state: "open",
    labels: ["bug", "router"],
    author: "maya",
    comments: 3,
    updatedAt: "2026-10-18T09:30:00Z",
  },
  { number: 7, title: "Docs: middleware order", state: "closed", comments: 0 },
  { number: 3, title: "Add HTTP/2", state: "open" },
];

const rows = () => [...container!.querySelectorAll<HTMLElement>(".sui-issues-row")];

describe("IssuesView", () => {
  test("lists every issue in the order given, with its state, number, title, labels, author, comments and date", async () => {
    await render(<IssuesView repo="maya/tinyhttp" issues={ISSUES} />);
    const section = container!.querySelector<HTMLElement>("section")!;
    expect(section.getAttribute("aria-label")).toBe("maya/tinyhttp issues");
    expect(container!.querySelector(".sui-issues-repo")!.textContent).toBe("maya/tinyhttp");
    expect(container!.querySelector(".sui-issues-counts")!.textContent).toBe("2 open · 1 closed");
    expect(rows().map((row) => row.dataset.state)).toEqual(["open", "closed", "open"]);
    const [first, second, third] = rows();
    expect(first!.querySelector(".sui-issues-state")!.textContent).toBe("Open");
    expect(first!.querySelector(".sui-issues-state")!.className).toContain("sui-badge-success");
    expect(first!.querySelector(".sui-issues-title")!.textContent).toBe("Router drops trailing slash");
    expect([...first!.querySelectorAll(".sui-issues-label")].map((label) => label.textContent)).toEqual(["bug", "router"]);
    expect(first!.querySelector(".sui-issues-number")!.textContent).toBe("#12");
    expect(first!.querySelector(".sui-issues-author")!.textContent).toBe("maya");
    expect(first!.querySelector(".sui-issues-comments")!.getAttribute("aria-label")).toBe("3 comments");
    const time = first!.querySelector("time")!;
    expect([time.getAttribute("datetime"), time.textContent]).toEqual(["2026-10-18T09:30:00Z", "2026-10-18"]);
    expect(second!.querySelector(".sui-issues-state")!.textContent).toBe("Closed");
    expect(second!.querySelector(".sui-issues-state")!.className).toContain("sui-badge-muted");
    // Zero comments, no author, no date and no labels show nothing.
    expect(second!.querySelector(".sui-issues-comments")).toBeNull();
    expect(third!.querySelector(".sui-issues-author, time, .sui-issues-label, .sui-issues-comments")).toBeNull();
  });

  test("renders data only: no links, buttons or other navigation", async () => {
    await render(<IssuesView repo="maya/tinyhttp" issues={ISSUES} size="full" />);
    expect(container!.querySelectorAll("a, button, [href], [role=link], [onclick]")).toHaveLength(0);
  });

  test("an empty list shows the library's empty state", async () => {
    await render(<IssuesView repo="maya/tinyhttp" issues={[]} />);
    expect(container!.querySelector("[data-slot=empty-state]")!.textContent).toBe("No issues");
    expect(container!.querySelector("ul")).toBeNull();
    expect(container!.querySelector(".sui-issues-counts")!.textContent).toBe("0 open · 0 closed");
  });

  test("inline is the default and its scrolling list is keyboard-focusable; full lets the list grow", async () => {
    await render(<IssuesView repo="r" issues={ISSUES} className="extra" id="host" />);
    const section = container!.querySelector<HTMLElement>("section")!;
    expect([section.dataset.size, section.id]).toEqual(["inline", "host"]);
    expect(section.className).toBe("sui-issues-view extra");
    expect(container!.querySelector("ul")!.tabIndex).toBe(0);
    await act(async () => root!.render(<IssuesView repo="r" issues={ISSUES} size="full" />));
    expect(container!.querySelector<HTMLElement>("section")!.dataset.size).toBe("full");
    expect(container!.querySelector("ul")!.hasAttribute("tabindex")).toBe(false);
    expect(issuesViewCss).toContain(".sui-issues-view[data-size='inline'] .sui-issues-list { max-height:320px; overflow-y:auto; }");
    expect(issuesViewCss.match(/\.[a-z][\w-]*/g)!.every((name) => name.startsWith(".sui-"))).toBe(true);
  });
});
