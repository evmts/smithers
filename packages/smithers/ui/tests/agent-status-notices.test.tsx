/** @jsxImportSource react */
// Notices (apps/mvp decision 0009 §4): the pure visibility rule, and the toast
// and stack props a person's feed needs. Real createRoot + act under happy-dom.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AGENT_STATES,
  AGENT_STATUS_GLYPHS,
  AGENT_STATUS_WORDS,
  NOTICE_GLYPHS,
  NOTICE_WORDS,
  noticeDismissDelay,
  type NoticeState,
  smithersUiCss,
  Toast,
  ToastStack,
  workNoticeVisible,
} from "../src";
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
  if (root === undefined) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  const mounted = root;
  await act(async () => mounted.render(element));
}

const $ = <E extends Element = HTMLElement>(selector: string) => container!.querySelector<E>(selector);
const $$ = (selector: string) => [...container!.querySelectorAll<HTMLElement>(selector)];
const click = (element: HTMLElement | null) => act(async () => element!.click());
const byText = (text: string) => $$("button").find((button) => button.textContent === text) ?? null;
const details = () => $$("[data-slot=toast] .sui-toast-text").map((text) => text.textContent);
const noop = () => {};

const NOTICE_STATES: ReadonlyArray<NoticeState> = [...AGENT_STATES, "update"];

describe("notice vocabulary", () => {
  test("the agent's glyphs and words, plus ● Updated for an update", () => {
    for (const state of AGENT_STATES) {
      expect(NOTICE_GLYPHS[state]).toBe(AGENT_STATUS_GLYPHS[state]);
      expect(NOTICE_WORDS[state]).toBe(AGENT_STATUS_WORDS[state]);
    }
    expect(NOTICE_GLYPHS.update).toBe("●");
    expect(NOTICE_WORDS.update).toBe("Updated");
    expect(Object.keys(NOTICE_GLYPHS).sort()).toEqual([...NOTICE_STATES].sort());
    expect(new Set(Object.values(NOTICE_GLYPHS)).size).toBe(NOTICE_STATES.length);
    expect(Object.isFrozen(NOTICE_GLYPHS) && Object.isFrozen(NOTICE_WORDS)).toBe(true);
  });
});

describe("noticeDismissDelay", () => {
  test("done and update hide after 4 s; the rest never hide on their own", () => {
    expect(noticeDismissDelay("done")).toBe(4000);
    expect(noticeDismissDelay("update")).toBe(4000);
    for (const state of ["working", "waiting", "needs_you", "failed"] as const) {
      expect(noticeDismissDelay(state)).toBe(Number.POSITIVE_INFINITY);
    }
  });
});

describe("workNoticeVisible", () => {
  const at = 1_000_000;
  const notice = (state: NoticeState, open = true, hidden = false) => ({ state, updatedAtMs: at, open, hidden });

  test("a done or update notice shows until exactly updatedAtMs + 4000, then hides", () => {
    for (const state of ["done", "update"] as const) {
      expect(workNoticeVisible(notice(state), at)).toBe(true);
      expect(workNoticeVisible(notice(state), at + 3999)).toBe(true);
      expect(workNoticeVisible(notice(state), at + 4000)).toBe(false);
      expect(workNoticeVisible(notice(state), at + 4001)).toBe(false);
    }
  });

  test("live, waiting, needs-you and failed notices never hide with time", () => {
    for (const state of ["working", "waiting", "needs_you", "failed"] as const) {
      expect(workNoticeVisible(notice(state), at + 4000)).toBe(true);
      expect(workNoticeVisible(notice(state), at + 7 * 24 * 3_600_000)).toBe(true);
      expect(workNoticeVisible(notice(state), Number.MAX_SAFE_INTEGER)).toBe(true);
    }
  });

  test("a closed or hidden notice never shows, whatever the clock", () => {
    for (const state of NOTICE_STATES) {
      for (const now of [at - 1, at, at + 1]) {
        expect(workNoticeVisible(notice(state, false, false), now)).toBe(false);
        expect(workNoticeVisible(notice(state, true, true), now)).toBe(false);
        expect(workNoticeVisible(notice(state, false, true), now)).toBe(false);
      }
    }
  });

  test("a clock behind the update still shows an open notice", () => {
    expect(workNoticeVisible(notice("done"), at - 60_000)).toBe(true);
  });
});

describe("Toast for notices", () => {
  test("word replaces the state's word in bold, before the detail", async () => {
    await render(
      <ToastStack>
        <Toast tone="update" word="main" detail="a1b2c3d Fix the parser" onHide={noop} />
      </ToastStack>,
    );
    const toast = $("[data-slot=toast]")!;
    expect(toast.dataset.tone).toBe("update");
    expect(toast.querySelector(".sui-toast-glyph")!.textContent).toBe("●");
    expect(toast.querySelector(".sui-toast-text b")!.textContent).toBe("main");
    expect(toast.textContent).toBe("●main · a1b2c3d Fix the parser×");
  });

  test("an update without a word reads Updated", async () => {
    await render(<Toast tone="update" onHide={noop} />);
    expect($(".sui-toast-text")!.textContent).toBe("Updated");
  });

  test("unread marks the toast, draws a dot before the glyph and says Unread to screen readers", async () => {
    await render(<Toast tone="done" detail="Clone tinyhttp" unread onHide={noop} />);
    const toast = $("[data-slot=toast]")!;
    expect(toast.hasAttribute("data-unread")).toBe(true);
    const dot = toast.firstElementChild as HTMLElement;
    expect(dot.className).toBe("sui-toast-unread");
    expect(dot.nextElementSibling!.className).toBe("sui-toast-glyph");
    const marker = dot.querySelector(".sui-sr-only")!;
    expect(marker.textContent).toBe("Unread");
    expect(marker.closest("[aria-hidden]")).toBeNull();
    // The visible line is unchanged.
    expect($(".sui-toast-text")!.textContent).toBe("Done · Clone tinyhttp");
  });

  test("a read toast has no unread mark", async () => {
    await render(<Toast tone="done" unread={false} onHide={noop} />);
    expect($("[data-slot=toast]")!.hasAttribute("data-unread")).toBe(false);
    expect($(".sui-toast-unread")).toBeNull();
    expect($("[data-slot=toast]")!.textContent).not.toContain("Unread");
  });

  test("hideLabel names the × button, and pressing it calls onHide", async () => {
    let dismissed = 0;
    await render(<Toast tone="failed" hideLabel="Dismiss" onHide={() => dismissed++} />);
    expect($("button[aria-label=Hide]")).toBeNull();
    await click($("button[aria-label=Dismiss]"));
    expect(dismissed).toBe(1);
  });

  test("the update tone is muted: its border and glyph use the muted foreground", () => {
    expect(smithersUiCss).toContain(".sui-toast[data-tone='update'] { border-left-color:var(--text-muted,");
    expect(smithersUiCss).toContain(".sui-toast[data-tone='update'] .sui-toast-glyph { color:var(--text-muted,");
    expect(smithersUiCss).toContain(".sui-toast-unread {");
    // A floating stack takes the pointer only on what it shows, never on its empty room.
    expect(smithersUiCss).toMatch(/\.sui-toast-stack \{[^}]*pointer-events:none;/);
    expect(smithersUiCss).toContain(".sui-toast-stack > * { pointer-events:auto; }");
  });
});

describe("ToastStack with more entries", () => {
  const toast = (id: string) => <Toast key={id} tone="needs_you" detail={id} onHide={noop} />;
  const entry = (id: string) => <Toast key={id} tone="done" detail={id} hideLabel="Dismiss" onHide={noop} />;

  test("+N counts the toasts past max plus every more entry; expanded shows toasts, then entries", async () => {
    await render(<ToastStack more={[entry("x"), entry("y")]}>{["a", "b", "c", "d"].map(toast)}</ToastStack>);
    expect(details()).toEqual(["Needs you · a", "Needs you · b", "Needs you · c"]);
    const button = byText("+3")!;
    expect(button.getAttribute("aria-expanded")).toBe("false");

    await click(button);
    expect(details()).toEqual([
      "Needs you · a",
      "Needs you · b",
      "Needs you · c",
      "Needs you · d",
      "Done · x",
      "Done · y",
    ]);
    const less = byText("Less")!;
    expect(less.getAttribute("aria-expanded")).toBe("true");
    // The button follows every entry.
    expect($("[data-slot=toast-stack]")!.lastElementChild).toBe(less);

    await click(less);
    expect(details()).toEqual(["Needs you · a", "Needs you · b", "Needs you · c"]);
    expect(byText("+3")!.getAttribute("aria-expanded")).toBe("false");
  });

  test("more entries alone count, even with every toast showing", async () => {
    await render(<ToastStack more={entry("x")}>{[toast("a")]}</ToastStack>);
    expect(details()).toEqual(["Needs you · a"]);
    await click(byText("+1"));
    expect(details()).toEqual(["Needs you · a", "Done · x"]);
  });

  test("with no toasts, the stack shows only +N until expanded", async () => {
    await render(<ToastStack more={[entry("x"), entry("y")]} />);
    expect($("[data-slot=toast-stack]")).not.toBeNull();
    expect($$("[data-slot=toast]")).toHaveLength(0);
    expect($$("button").map((button) => button.textContent)).toEqual(["+2"]);
    await click(byText("+2"));
    expect(details()).toEqual(["Done · x", "Done · y"]);
    expect($$("button[aria-label=Dismiss]")).toHaveLength(2);
  });

  test("no button while nothing is folded away", async () => {
    await render(<ToastStack more={[]}>{["a", "b", "c"].map(toast)}</ToastStack>);
    expect(details()).toHaveLength(3);
    expect(byText("Less")).toBeNull();
    expect($("button.sui-toast-more")).toBeNull();
  });

  test("renders nothing with no toasts and no more entries", async () => {
    await render(<ToastStack more={[]}>{[]}</ToastStack>);
    expect(container!.innerHTML).toBe("");
    await render(<ToastStack more={null} />);
    expect(container!.innerHTML).toBe("");
  });
});
