/** @jsxImportSource react */
// ItemConversation as GitHub's issue page for any item under happy-dom: a state pill from `status`, the number's
// prefix, the timeline's events, and the side column. Real createRoot + act.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ItemAsideSection,
  ItemConversation,
  itemConversationCss,
  type ItemConversationEvent,
  type ItemConversationProps,
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
  document.querySelectorAll(`style[${SMITHERS_UI_STYLE_ATTR}]`).forEach((el) => el.remove());
});

async function render(element: ReactElement): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  await act(async () => mounted.render(element));
}

const TODO: ItemConversationProps = {
  title: "Retry webhook delivery",
  number: 4,
  numberPrefix: "T",
  state: "open",
  status: { kind: "queued", label: "Queued" },
  author: "ann",
  body: "Retry each failed delivery.",
  comments: [],
};

const EVENTS: ReadonlyArray<ItemConversationEvent> = [
  { id: "committed", kind: "queued", author: "ann", text: "committed", createdAt: "2026-10-20T10:00:00Z" },
  { id: "dropped", kind: "dropped", text: "Dropped" },
];

const article = () => container!.querySelector<HTMLElement>("article")!;

describe("ItemConversation: any item's page", () => {
  test("status sets the pill's icon, word and variant, and data-status; the number takes the prefix", async () => {
    await render(<ItemConversation {...TODO} />);
    expect(article().querySelector("h1")!.textContent).toBe("Retry webhook delivery T4");
    const pill = article().querySelector<HTMLElement>(".sui-item-conv-state")!;
    expect([pill.textContent, pill.dataset.status, pill.className.includes("sui-badge-outline")]).toEqual(["Queued", "queued", true]);
    expect(pill.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect([article().dataset.state, article().dataset.status]).toEqual(["open", "queued"]);
    await act(async () => root!.render(<ItemConversation {...TODO} number={null} status={{ kind: "merged", label: "Merged" }} state="closed" />));
    expect(article().querySelector(".sui-item-conv-number")!.textContent).toBe("T–");
    expect(article().querySelector<HTMLElement>(".sui-item-conv-state")!.className).toContain("sui-badge-default");
  });

  test("events show after the body as a timeline: icon, author, text and when, in the host's order", async () => {
    await render(<ItemConversation {...TODO} events={EVENTS} comments={[{ id: "c", body: "Looks right" }]} />);
    const timeline = article().querySelector<HTMLElement>("ol[aria-label=Timeline]")!;
    const main = article().querySelector(".sui-item-conv-main")!;
    expect([...main.children].map((child) => child.className)).toEqual([
      "sui-item-conv-post",
      "sui-item-conv-events",
      "sui-item-conv-comments",
    ]);
    const items = [...timeline.querySelectorAll<HTMLElement>("li")];
    expect(items.map((item) => item.dataset.kind)).toEqual(["queued", "dropped"]);
    expect(items.map((item) => item.querySelector(".sui-item-conv-event-text")!.textContent)).toEqual(["ann committed", "Dropped"]);
    expect(items[0]!.querySelector(".sui-item-conv-author")!.textContent).toBe("ann");
    expect(items[0]!.querySelector("time")!.getAttribute("datetime")).toBe("2026-10-20T10:00:00.000Z");
    expect(items[1]!.querySelector("time, .sui-item-conv-author")).toBeNull();
    expect(items.map((item) => item.querySelector("svg")!.dataset.kind)).toEqual(["queued", "dropped"]);
  });

  test("no events, or an empty list, shows no timeline", async () => {
    await render(<ItemConversation {...TODO} />);
    expect(article().querySelector("[aria-label=Timeline]")).toBeNull();
    await act(async () => root!.render(<ItemConversation {...TODO} events={[]} />));
    expect(article().querySelector("[aria-label=Timeline]")).toBeNull();
  });

  test("aside adds the side column and marks the article two-column; its sections are named groups", async () => {
    let dropped = 0;
    await render(
      <ItemConversation
        {...TODO}
        aside={
          <>
            <ItemAsideSection title="Branch" className="extra">
              <a href="/o/r/tree/smithers/t4">smithers/t4</a>
            </ItemAsideSection>
            <button type="button" onClick={() => (dropped += 1)}>
              Drop
            </button>
          </>
        }
      />,
    );
    expect(article().hasAttribute("data-aside")).toBe(true);
    const aside = article().querySelector<HTMLElement>("aside.sui-item-conv-aside")!;
    expect(aside.previousElementSibling!.className).toBe("sui-item-conv-main");
    const section = aside.querySelector<HTMLElement>("[data-slot=item-aside-section]")!;
    expect([section.tagName, section.getAttribute("aria-label"), section.className]).toEqual([
      "SECTION",
      "Branch",
      "sui-item-aside-section extra",
    ]);
    expect(section.querySelector(".sui-item-aside-title")!.textContent).toBe("Branch");
    aside.querySelector("button")!.click();
    expect(dropped).toBe(1);
  });

  test("a section's links: http(s) in a new tab, in-app ones navigate on a plain click, unsafe ones show nothing", async () => {
    const seen: Array<string> = [];
    await render(
      <ItemConversation
        {...TODO}
        aside={
          <ItemAsideSection
            title="Issue"
            links={[
              { label: "#7", href: "/o/r/issues/7" },
              { label: "#42", href: "https://github.com/o/r/pull/42" },
              { label: "bad", href: "javascript:alert(1)" },
            ]}
            onNavigate={(href) => seen.push(href)}
          />
        }
      />,
    );
    const links = [...article().querySelectorAll<HTMLAnchorElement>(".sui-item-aside-link")];
    expect(links.map((link) => [link.textContent, link.getAttribute("target")])).toEqual([
      ["#7", null],
      ["#42", "_blank"],
    ]);
    let followed = true;
    await act(async () => {
      followed = links[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    expect([followed, seen]).toEqual([false, ["/o/r/issues/7"]]);
  });

  test("without aside, or with a null one, the page is one column", async () => {
    await render(<ItemConversation {...TODO} />);
    expect([article().hasAttribute("data-aside"), article().querySelector("aside")]).toEqual([false, null]);
    await act(async () => root!.render(<ItemConversation {...TODO} aside={null} />));
    expect([article().hasAttribute("data-aside"), article().querySelector("aside")]).toEqual([false, null]);
  });

  test("the sheet lays the side column beside the main one from 768 pixels, and the timeline on a rail", () => {
    expect(itemConversationCss).toContain("@media (min-width:768px)");
    expect(itemConversationCss).toContain(".sui-item-conv[data-aside] { grid-template-columns:minmax(0, 1fr) 256px;");
    expect(itemConversationCss).toContain(".sui-item-conv[data-aside] > .sui-item-conv-header { grid-column:1 / -1; }");
    expect(itemConversationCss).toContain(".sui-item-conv-events::before");
  });
});
