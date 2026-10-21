/** @jsxImportSource react */
// IssuesView as GitHub's lists under happy-dom: state icons, Open and Closed tabs, an ordered list such as a stack,
// meta links, a row's menu, and keyboard movement between rows. Real createRoot + act, native events.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ITEM_STATE_VARIANTS,
  ItemStateIcon,
  type ItemStateKind,
  IssuesView,
  issuesViewCss,
  type IssuesViewIssue,
  type IssuesViewState,
  SMITHERS_UI_STYLE_ATTR,
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
  document.body.innerHTML = "";
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

/** Clicks like a browser, returning whether the default action (following the link) still runs. */
async function click(el: Element, init: MouseEventInit = {}): Promise<boolean> {
  let followed = true;
  await act(async () => {
    followed = el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
  });
  return followed;
}

/** Presses a key like a browser, returning whether its default action still runs. */
async function key(el: Element, init: KeyboardEventInit): Promise<boolean> {
  let followed = true;
  await act(async () => {
    followed = el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
  return followed;
}

const KINDS: ReadonlyArray<ItemStateKind> = [
  "open",
  "closed",
  "requested",
  "queued",
  "running",
  "needs_you",
  "in_review",
  "merged",
  "dropped",
  "failed",
];

/** A stack as a host passes it: open TODOs in merge order, a commit not numbered yet, then settled ones. */
const STACK: ReadonlyArray<IssuesViewIssue> = [
  { id: "a", number: 4, title: "Retry webhook delivery", state: "open", status: { kind: "running", label: "Working" }, author: "ann" },
  { id: "b", number: 5, title: "Add rate limit headers", state: "open", status: { kind: "queued", label: "Queued" } },
  { id: "c", number: null, title: "Fix the docs", state: "open", status: { kind: "requested", label: "Requested" }, pending: "requested" },
  { id: "d", number: 3, title: "Fix README typo", state: "closed", status: { kind: "merged", label: "Merged" } },
  { id: "e", number: 2, title: "Old idea", state: "closed", status: { kind: "dropped", label: "Dropped" } },
];

const rows = () => [...container!.querySelectorAll<HTMLElement>("[data-slot=issues-row]")];
const titles = () => rows().map((row) => row.querySelector(".sui-issues-title")!.textContent);
const tabs = () => [...container!.querySelectorAll<HTMLAnchorElement>(".sui-issues-filter")];

const stackHref = (state: IssuesViewState) => (state === "open" ? "/o/r/stack" : "/o/r/stack?state=closed");

describe("ItemStateIcon", () => {
  test("every kind is a 16-pixel image named by its word, with a shape of its own", async () => {
    await render(<div>{KINDS.map((kind) => <ItemStateIcon key={kind} kind={kind} label={`word ${kind}`} />)}</div>);
    const icons = [...container!.querySelectorAll<SVGElement>("svg")];
    expect(icons.map((icon) => icon.dataset.kind)).toEqual([...KINDS]);
    for (const icon of icons) {
      expect([icon.getAttribute("role"), icon.getAttribute("aria-label"), icon.getAttribute("width")]).toEqual([
        "img",
        `word ${icon.dataset.kind}`,
        "16",
      ]);
      expect(icon.getAttribute("class")).toContain("sui-state-icon");
      expect(icon.textContent).toBe("");
    }
    expect(new Set(icons.map((icon) => icon.innerHTML)).size).toBe(KINDS.length);
  });

  test("a live icon carries data-live and blinks once every 2 s; others don't", async () => {
    await render(
      <div>
        <ItemStateIcon kind="running" label="Working" live />
        <ItemStateIcon kind="running" label="Working" />
        <ItemStateIcon kind="in_review" label="In review" live={false} />
      </div>,
    );
    const icons = [...container!.querySelectorAll<SVGElement>("svg")];
    expect(icons.map((icon) => icon.hasAttribute("data-live"))).toEqual([true, false, false]);
    expect(issuesViewCss).toContain(".sui-state-icon[data-live] { animation:sui-state-live 2s ease-in-out infinite; }");
    // Reduced motion is the document-wide policy's (reducedMotionCss), which ends it at once: proved in browser/.
    expect(issuesViewCss).not.toContain("prefers-reduced-motion");
  });

  test("each kind has a pill variant, and the sheet colors the icon of each kind that isn't muted", () => {
    expect(Object.keys(ITEM_STATE_VARIANTS).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS.filter((kind) => ITEM_STATE_VARIANTS[kind] !== "muted")) {
      expect(issuesViewCss).toContain(`.sui-state-icon[data-kind='${kind}']`);
    }
  });
});

describe("IssuesView: state icons and the host's order", () => {
  test("a row's status draws its icon and names it; data-status carries the kind", async () => {
    await render(<IssuesView repo="o/r" issues={STACK} numberPrefix="T" ordered />);
    expect(rows().map((row) => row.dataset.status)).toEqual(["running", "queued", "requested", "merged", "dropped"]);
    expect(rows().map((row) => row.querySelector(".sui-issues-state")!.getAttribute("aria-label"))).toEqual([
      "Working",
      "Queued",
      "Requested",
      "Merged",
      "Dropped",
    ]);
    expect(rows().map((row) => row.dataset.state)).toEqual(["open", "open", "open", "closed", "closed"]);
  });

  test("a live status blinks its row's icon and marks the row data-live; every other row is steady", async () => {
    const live = STACK.map((issue, index) =>
      index === 0 ? { ...issue, status: { kind: "running" as const, label: "Working", live: true } } : issue
    );
    await render(<IssuesView repo="o/r" issues={live} numberPrefix="T" ordered />);
    expect(rows().map((row) => row.hasAttribute("data-live"))).toEqual([true, false, false, false, false]);
    expect(rows().map((row) => row.querySelector(".sui-issues-state")!.hasAttribute("data-live"))).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  test("ordered rows are an ol in the host's order; numbers take the view's prefix, T– before numbering", async () => {
    await render(<IssuesView repo="o/r" issues={STACK} numberPrefix="T" ordered />);
    expect(container!.querySelector(".sui-issues-list")!.tagName).toBe("OL");
    expect(titles()).toEqual(STACK.map((issue) => issue.title));
    expect(rows().map((row) => row.querySelector(".sui-issues-number")!.textContent)).toEqual(["T4", "T5", "T–", "T3", "T2"]);
    await rerender(<IssuesView repo="o/r" issues={STACK} />);
    expect(container!.querySelector(".sui-issues-list")!.tagName).toBe("UL");
    expect(rows()[0]!.querySelector(".sui-issues-number")!.textContent).toBe("#4");
  });

  test("emptyTitle names an empty list", async () => {
    await render(<IssuesView repo="o/r" issues={[]} emptyTitle="No TODOs" />);
    expect(container!.querySelector("[data-slot=empty-state]")!.textContent).toBe("No TODOs");
  });
});

describe("IssuesView: Open and Closed tabs", () => {
  test("the tabs replace the name and counts, count each state, and mark the current one", async () => {
    await render(<IssuesView repo="o/r" issues={STACK} filter={{ state: "open", href: stackHref }} />);
    expect(container!.querySelector(".sui-issues-repo, .sui-issues-counts")).toBeNull();
    expect(container!.querySelector("nav")!.getAttribute("aria-label")).toBe("Filter");
    expect(tabs().map((tab) => [tab.textContent, tab.getAttribute("href"), tab.getAttribute("aria-current")])).toEqual([
      ["3Open", "/o/r/stack", "page"],
      ["2Closed", "/o/r/stack?state=closed", null],
    ]);
    expect(tabs().map((tab) => tab.querySelector("svg")!.getAttribute("aria-hidden"))).toEqual(["true", "true"]);
  });

  test("only the current state's rows show; the counts stay whole", async () => {
    await render(<IssuesView repo="o/r" issues={STACK} filter={{ state: "open", href: stackHref }} />);
    expect(titles()).toEqual(["Retry webhook delivery", "Add rate limit headers", "Fix the docs"]);
    await rerender(<IssuesView repo="o/r" issues={STACK} filter={{ state: "closed", href: stackHref }} />);
    expect(titles()).toEqual(["Fix README typo", "Old idea"]);
    expect(tabs().map((tab) => tab.getAttribute("aria-current"))).toEqual([null, "page"]);
    expect(tabs().map((tab) => tab.querySelector(".sui-issues-filter-count")!.textContent)).toEqual(["3", "2"]);
  });

  test("while unknown, the tabs show no counts and an empty list shows nothing, with no busy state", async () => {
    await render(<IssuesView repo="o/r" issues={[]} unknown emptyTitle="No TODOs" filter={{ state: "open", href: stackHref }} />);
    expect(tabs().map((tab) => tab.textContent)).toEqual(["Open", "Closed"]);
    expect(container!.querySelector("[data-slot=empty-state], .sui-issues-loading, .sui-issues-list, [aria-busy]")).toBeNull();
    // Rows already on the device show with their counts.
    await rerender(<IssuesView repo="o/r" issues={STACK} filter={{ state: "open", href: stackHref }} />);
    expect(tabs().map((tab) => tab.textContent)).toEqual(["3Open", "2Closed"]);
  });

  test("a state with no rows shows the empty state under its tabs", async () => {
    await render(
      <IssuesView repo="o/r" issues={STACK.slice(0, 2)} emptyTitle="No TODOs" filter={{ state: "closed", href: stackHref }} />,
    );
    expect(tabs()).toHaveLength(2);
    expect(container!.querySelector("[data-slot=empty-state]")!.textContent).toBe("No TODOs");
  });

  test("a plain click on a tab calls onSelect and prevents the default; a modified click is the browser's", async () => {
    const seen: Array<[IssuesViewState, string]> = [];
    await render(
      <IssuesView
        repo="o/r"
        issues={STACK}
        filter={{ state: "open", href: stackHref, onSelect: (state, href) => seen.push([state, href]) }}
      />,
    );
    expect(await click(tabs()[1]!)).toBe(false);
    expect(await click(tabs()[1]!, { metaKey: true })).toBe(true);
    expect(seen).toEqual([["closed", "/o/r/stack?state=closed"]]);
  });

  test("without onSelect, or with an unsafe link, a tab is the browser's", async () => {
    await render(
      <IssuesView repo="o/r" issues={STACK} filter={{ state: "open", href: (state) => (state === "open" ? "javascript:x" : "/c") }} />,
    );
    expect(tabs()[0]!.hasAttribute("href")).toBe(false);
    expect(await click(tabs()[1]!)).toBe(true);
    const seen: Array<string> = [];
    await rerender(
      <IssuesView
        repo="o/r"
        issues={STACK}
        filter={{ state: "open", href: (state) => (state === "open" ? "javascript:x" : "/c"), onSelect: (state) => seen.push(state) }}
      />,
    );
    expect(await click(tabs()[0]!)).toBe(true);
    expect(seen).toEqual([]);
  });
});

describe("IssuesView: links in the meta line", () => {
  const LINKED: ReadonlyArray<IssuesViewIssue> = [
    {
      id: "a",
      number: 4,
      title: "Retry webhook delivery",
      state: "open",
      links: [
        { label: "smithers/t4-retry", href: "/o/r/tree/smithers/t4-retry" },
        { label: "#42", href: "https://github.com/o/r/pull/42" },
        { label: "bad", href: "javascript:alert(1)" },
      ],
    },
  ];

  test("an http(s) link opens in a new tab; an in-app link navigates on a plain click; an unsafe one shows nothing", async () => {
    const seen: Array<string> = [];
    await render(<IssuesView repo="o/r" issues={LINKED} onNavigate={(_, href) => seen.push(href)} />);
    const links = [...rows()[0]!.querySelectorAll<HTMLAnchorElement>(".sui-issues-meta-link")];
    expect(links.map((link) => [link.textContent, link.getAttribute("href"), link.getAttribute("target")])).toEqual([
      ["smithers/t4-retry", "/o/r/tree/smithers/t4-retry", null],
      ["#42", "https://github.com/o/r/pull/42", "_blank"],
    ]);
    expect(links[1]!.getAttribute("rel")).toBe("noopener noreferrer");
    expect(await click(links[0]!)).toBe(false);
    expect(await click(links[0]!, { ctrlKey: true })).toBe(true);
    expect(await click(links[1]!)).toBe(true);
    expect(seen).toEqual(["/o/r/tree/smithers/t4-retry"]);
  });

  test("without onNavigate an in-app link is the browser's", async () => {
    await render(<IssuesView repo="o/r" issues={LINKED} />);
    expect(await click(rows()[0]!.querySelector(".sui-issues-meta-link")!)).toBe(true);
  });
});

describe("IssuesView: a row's menu", () => {
  test("a row with menu items has a ⋯ button named for its number; a row without has none", async () => {
    const issues: ReadonlyArray<IssuesViewIssue> = [
      { ...STACK[0]!, menu: [{ label: "Drop", onSelect: () => {} }] },
      { ...STACK[1]!, menu: [] },
      STACK[2]!,
    ];
    await render(<IssuesView repo="o/r" issues={issues} numberPrefix="T" />);
    const [first, second, third] = rows();
    expect(first!.querySelector("[data-slot=action-menu-trigger]")!.getAttribute("aria-label")).toBe("T4 actions");
    expect(second!.querySelector("[data-slot=action-menu-trigger]")).toBeNull();
    expect(third!.querySelector("[data-slot=action-menu-trigger]")).toBeNull();
  });

  test("the menu's item runs from the row", async () => {
    const ran: Array<string> = [];
    await render(
      <IssuesView repo="o/r" issues={[{ ...STACK[0]!, menu: [{ label: "Drop", onSelect: () => ran.push("drop") }] }]} numberPrefix="T" />,
    );
    await key(rows()[0]!.querySelector("[data-slot=action-menu-trigger]")!, { key: "Enter" });
    await act(async () => document.querySelector<HTMLElement>("[role=menuitem]")!.click());
    expect(ran).toEqual(["drop"]);
  });
});

describe("IssuesView: keyboard", () => {
  const linked = () => (
    <IssuesView repo="o/r" issues={STACK} href={(issue) => (issue.number === null ? undefined : `/o/r/stack/${issue.number}`)} />
  );
  const links = () => rows().map((row) => row.querySelector<HTMLAnchorElement>("a.sui-issues-title"));

  test("ArrowDown and ArrowUp move between the rows' links, skipping rows without one; Home and End go to the ends", async () => {
    await render(linked());
    const [first, second, , fourth, fifth] = links();
    first!.focus();
    expect(await key(first!, { key: "ArrowDown" })).toBe(false);
    expect(document.activeElement).toBe(second!);
    await key(second!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(fourth!);
    await key(fourth!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(second!);
    await key(second!, { key: "End" });
    expect(document.activeElement).toBe(fifth!);
    await key(fifth!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(fifth!);
    await key(fifth!, { key: "Home" });
    expect(document.activeElement).toBe(first!);
    await key(first!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first!);
  });

  test("from a row without a link, or from the list, ArrowDown goes to the first link; modified keys and others are the browser's", async () => {
    await render(linked());
    const unlinked = rows()[2]!;
    expect(await key(unlinked, { key: "ArrowDown" })).toBe(false);
    expect(document.activeElement).toBe(links()[0]!);
    expect(await key(links()[0]!, { key: "ArrowDown", shiftKey: true })).toBe(true);
    expect(await key(links()[0]!, { key: "ArrowDown", altKey: true })).toBe(true);
    expect(await key(links()[0]!, { key: "Enter" })).toBe(true);
    expect(document.activeElement).toBe(links()[0]!);
  });

  test("a list without links leaves the keys to the browser, so an inline list scrolls", async () => {
    await render(<IssuesView repo="o/r" issues={STACK} />);
    const list = container!.querySelector<HTMLElement>(".sui-issues-list")!;
    expect(await key(list, { key: "ArrowDown" })).toBe(true);
  });
});
