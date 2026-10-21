/** @jsxImportSource react */
// IssuesView under happy-dom: real createRoot + act.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IssuesView, issuesViewCss, type IssuesViewIssue, type IssuesViewTriage, TRIAGE_WORDS } from "../src/issues-view";
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

/** Clicks `el` like a browser, returning whether the default action (following the link) still runs. */
async function click(el: Element, init: MouseEventInit = {}): Promise<boolean> {
  let followed = true;
  await act(async () => {
    followed = el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
  });
  return followed;
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

describe("IssuesView: pending rows, links, loading and actions", () => {
  const PENDING: ReadonlyArray<IssuesViewIssue> = [
    { id: "w-1", number: null, title: "Crash on empty body", state: "open", pending: "requested" },
    { id: "w-2", number: null, title: "Typo in README", state: "open", pending: "not_sent" },
    { id: "i-12", number: 12, title: "Router drops trailing slash", state: "open" },
  ];

  test("an unnumbered issue shows #– and each pending write shows its chip", async () => {
    await render(<IssuesView repo="maya/tinyhttp" issues={PENDING} />);
    const [requested, notSent, synced] = rows();
    expect(requested!.querySelector(".sui-issues-number")!.textContent).toBe("#–");
    expect(notSent!.querySelector(".sui-issues-number")!.textContent).toBe("#–");
    expect(synced!.querySelector(".sui-issues-number")!.textContent).toBe("#12");
    expect(rows().map((row) => row.dataset.pending ?? null)).toEqual(["requested", "not_sent", null]);
    const chip = (row: HTMLElement) => row.querySelector<HTMLElement>(".sui-issues-pending");
    expect(chip(requested!)!.textContent).toBe("Requested");
    expect(chip(requested!)!.className).toContain("sui-badge-muted");
    expect(chip(notSent!)!.textContent).toBe("Not sent");
    expect(chip(notSent!)!.className).toContain("sui-badge-destructive");
    expect(chip(synced!)).toBeNull();
  });

  test("rows are keyed by id, so a pending row keeps its element when GitHub numbers it", async () => {
    await render(<IssuesView repo="r" issues={PENDING} />);
    const before = rows()[0]!;
    const numbered: ReadonlyArray<IssuesViewIssue> = [
      PENDING[2]!,
      { id: "w-1", number: 31, title: "Crash on empty body", state: "open" },
    ];
    await act(async () => root!.render(<IssuesView repo="r" issues={numbered} />));
    const after = rows()[1]!;
    expect(after).toBe(before);
    expect(after.querySelector(".sui-issues-number")!.textContent).toBe("#31");
    expect(after.querySelector(".sui-issues-pending")).toBeNull();
    expect(after.hasAttribute("data-pending")).toBe(false);
  });

  test("two unnumbered rows without ids both render", async () => {
    const anonymous: ReadonlyArray<IssuesViewIssue> = [
      { number: null, title: "First", state: "open", pending: "requested" },
      { number: null, title: "Second", state: "open", pending: "requested" },
    ];
    await render(<IssuesView repo="r" issues={anonymous} />);
    expect(rows().map((row) => row.querySelector(".sui-issues-title")!.textContent)).toEqual(["First", "Second"]);
  });

  test("href makes each title a link; undefined or an unsafe scheme leaves plain text", async () => {
    const href = (issue: IssuesViewIssue) =>
      issue.number === null ? undefined : issue.number === 7 ? "javascript:alert(1)" : `/maya/tinyhttp/issues/${issue.number}`;
    await render(<IssuesView repo="maya/tinyhttp" issues={ISSUES} href={href} />);
    const [first, second, third] = rows();
    const link = first!.querySelector<HTMLAnchorElement>("a.sui-issues-title")!;
    expect([link.getAttribute("href"), link.textContent]).toEqual(["/maya/tinyhttp/issues/12", "Router drops trailing slash"]);
    expect(second!.querySelector("a, [href]")).toBeNull();
    expect(second!.querySelector(".sui-issues-title")!.textContent).toBe("Docs: middleware order");
    expect(third!.querySelector("a")!.getAttribute("href")).toBe("/maya/tinyhttp/issues/3");
    await act(async () => root!.render(<IssuesView repo="maya/tinyhttp" issues={PENDING} href={href} />));
    expect(rows()[0]!.querySelector("a")).toBeNull();
  });

  test("a plain click navigates in-app and prevents the default; a modified click is the browser's", async () => {
    const seen: Array<[number | null, string]> = [];
    await render(
      <IssuesView
        repo="maya/tinyhttp"
        issues={ISSUES}
        href={(issue) => `/maya/tinyhttp/issues/${issue.number}`}
        onNavigate={(issue, href) => seen.push([issue.number, href])}
      />,
    );
    const link = () => rows()[0]!.querySelector("a")!;
    expect(await click(link())).toBe(false);
    expect(seen).toEqual([[12, "/maya/tinyhttp/issues/12"]]);
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(await click(link(), modifier)).toBe(true);
    }
    expect(seen).toHaveLength(1);
  });

  test("without onNavigate a click follows the link", async () => {
    await render(<IssuesView repo="r" issues={ISSUES} href={(issue) => `/i/${issue.number}`} />);
    expect(await click(rows()[0]!.querySelector("a")!)).toBe(true);
  });

  test("loading with no rows shows a status and placeholders, never No issues or counts", async () => {
    await render(<IssuesView repo="maya/tinyhttp" issues={[]} loading />);
    const section = container!.querySelector<HTMLElement>("section")!;
    expect(section.getAttribute("aria-busy")).toBe("true");
    const status = container!.querySelector<HTMLElement>("[role=status]")!;
    expect(status.getAttribute("aria-label")).toBe("Loading issues");
    expect(container!.querySelector("[data-slot=empty-state]")).toBeNull();
    expect(container!.textContent).not.toContain("No issues");
    expect(container!.querySelector(".sui-issues-counts")).toBeNull();
    expect(container!.querySelector(".sui-issues-loading")!.getAttribute("aria-hidden")).toBe("true");
    expect(container!.querySelectorAll(".sui-issues-loading [data-slot=skeleton]")).toHaveLength(3);
    // Once loaded, an empty list is the empty state and the busy flag is gone.
    await act(async () => root!.render(<IssuesView repo="maya/tinyhttp" issues={[]} />));
    expect(section.hasAttribute("aria-busy")).toBe(false);
    expect(container!.querySelector("[role=status]")).toBeNull();
    expect(container!.querySelector("[data-slot=empty-state]")!.textContent).toBe("No issues");
  });

  test("loading with rows already known (this device's pending writes) shows them beside the status", async () => {
    await render(<IssuesView repo="r" issues={PENDING.slice(0, 1)} loading />);
    expect(rows()).toHaveLength(1);
    expect(container!.querySelector("[role=status]")!.getAttribute("aria-label")).toBe("Loading issues");
    expect(container!.querySelector(".sui-issues-loading, [data-slot=empty-state]")).toBeNull();
  });

  test("actions render in the header and stay keyboard-reachable buttons", async () => {
    let created = 0;
    await render(
      <IssuesView
        repo="r"
        issues={ISSUES}
        actions={
          <button type="button" onClick={() => (created += 1)}>
            New issue
          </button>
        }
      />,
    );
    const button = container!.querySelector<HTMLButtonElement>("header .sui-issues-actions button")!;
    expect(button.textContent).toBe("New issue");
    button.focus();
    expect(document.activeElement).toBe(button);
    await click(button);
    expect(created).toBe(1);
  });
});

describe("IssuesView: triage", () => {
  const TRIAGED: ReadonlyArray<IssuesViewIssue> = [
    { number: 31, title: "Crash on empty body", state: "open", triage: "proposed", pending: "requested", author: "sam" },
    { number: 30, title: "Add HTTP/2", state: "open", triage: "accepted" },
    { number: 29, title: "Rewrite in Rust", state: "open", triage: "not_accepted" },
    { number: 28, title: "Router drops trailing slash", state: "closed", triage: "conflict" },
    { number: 27, title: "Docs: middleware order", state: "open" },
  ];
  const chip = (row: HTMLElement) => row.querySelector<HTMLElement>(".sui-issues-triage");

  test("each triaged row shows its state's chip in its variant; a row without triage shows none", async () => {
    await render(<IssuesView repo="maya/tinyhttp" issues={TRIAGED} />);
    const expected: ReadonlyArray<[IssuesViewTriage, string, string]> = [
      ["proposed", "Proposed", "sui-badge-outline"],
      ["accepted", "Accepted", "sui-badge-success"],
      ["not_accepted", "Not accepted", "sui-badge-muted"],
      ["conflict", "Conflict", "sui-badge-warning"],
    ];
    const all = rows();
    expected.forEach(([triage, word, variant], index) => {
      const shown = chip(all[index]!)!;
      expect([shown.textContent, shown.dataset.triage, TRIAGE_WORDS[triage]]).toEqual([word, triage, word]);
      expect(shown.className).toContain(variant);
      expect(shown.closest(".sui-issues-meta")).not.toBeNull();
    });
    expect(chip(all[4]!)).toBeNull();
    expect(all[4]!.querySelector("[data-triage]")).toBeNull();
  });

  test("the chip follows the number and precedes the pending chip and author", async () => {
    await render(<IssuesView repo="r" issues={TRIAGED.slice(0, 1)} />);
    const meta = rows()[0]!.querySelector(".sui-issues-meta")!;
    expect([...meta.children].map((child) => child.textContent)).toEqual(["#31", "Proposed", "Requested", "sam"]);
  });

  test("triage adds no link, button or other control", async () => {
    await render(<IssuesView repo="r" issues={TRIAGED} size="full" />);
    expect(container!.querySelectorAll("a, button, [href], [role=link], [onclick]")).toHaveLength(0);
  });
});
