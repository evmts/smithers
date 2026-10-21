/** @jsxImportSource react */
// TriageControl under happy-dom: real createRoot + act, native events.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  type IssuesViewTriage,
  SMITHERS_UI_STYLE_ATTR,
  smithersUiCss,
  TRIAGE_WORDS,
  TriageControl,
  triageControlCss,
  type TriageControlProps,
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

async function click(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
}

const STATES: ReadonlyArray<IssuesViewTriage> = ["proposed", "accepted", "not_accepted", "conflict"];
const group = () => container!.querySelector<HTMLElement>("[role=group]")!;
const buttons = () => [...group().querySelectorAll<HTMLButtonElement>("button")];
const labels = () => buttons().map((button) => button.textContent);
const button = (name: string) => buttons().find((candidate) => candidate.textContent === name)!;
const noop = () => {};

describe("TriageControl: the state chip", () => {
  test("each state shows its word in its badge variant", async () => {
    const expected: Record<IssuesViewTriage, [string, string]> = {
      proposed: ["Proposed", "sui-badge-outline"],
      accepted: ["Accepted", "sui-badge-success"],
      not_accepted: ["Not accepted", "sui-badge-muted"],
      conflict: ["Conflict", "sui-badge-warning"],
    };
    await render(<TriageControl state="proposed" />);
    for (const state of STATES) {
      await rerender(<TriageControl state={state} />);
      const chip = group().querySelector<HTMLElement>(".sui-triage-state")!;
      expect([chip.textContent, chip.dataset.triage, group().dataset.triage]).toEqual([expected[state][0], state, state]);
      expect(chip.className).toContain(expected[state][1]);
      expect(TRIAGE_WORDS[state]).toBe(expected[state][0]);
    }
  });

  test("the group is named Triage, or by the host's aria-label, and passes other props through", async () => {
    await render(<TriageControl state="proposed" id="t" className="extra" data-row="31" />);
    expect(group().getAttribute("aria-label")).toBe("Triage");
    expect([group().id, group().className, group().dataset.row]).toEqual(["t", "sui-triage-control extra", "31"]);
    expect(group().dataset.slot).toBe("triage-control");
    await rerender(<TriageControl state="proposed" aria-label="Triage #31" />);
    expect(group().getAttribute("aria-label")).toBe("Triage #31");
  });

  test("pending shows Requested or Not sent beside the state; absent shows none", async () => {
    await render(<TriageControl state="proposed" pending="requested" />);
    const pending = () => group().querySelector<HTMLElement>(".sui-triage-pending");
    expect(pending()!.textContent).toBe("Requested");
    expect(pending()!.className).toContain("sui-badge-muted");
    expect(group().dataset.pending).toBe("requested");
    await rerender(<TriageControl state="accepted" pending="not_sent" />);
    expect(pending()!.textContent).toBe("Not sent");
    expect(pending()!.className).toContain("sui-badge-destructive");
    expect(group().dataset.pending).toBe("not_sent");
    await rerender(<TriageControl state="accepted" />);
    expect(pending()).toBeNull();
    expect(group().hasAttribute("data-pending")).toBe(false);
  });
});

describe("TriageControl: buttons", () => {
  test("with every handler: proposed and conflict offer both decisions, a decided issue offers the other", async () => {
    const all = { onAccept: noop, onReject: noop, onRunAgain: noop };
    await render(<TriageControl state="proposed" {...all} />);
    expect(labels()).toEqual(["Accept", "Not accepted", "Run triage again"]);
    await rerender(<TriageControl state="conflict" {...all} />);
    expect(labels()).toEqual(["Accept", "Not accepted", "Run triage again"]);
    await rerender(<TriageControl state="accepted" {...all} />);
    expect(labels()).toEqual(["Not accepted", "Run triage again"]);
    await rerender(<TriageControl state="not_accepted" {...all} />);
    expect(labels()).toEqual(["Accept", "Run triage again"]);
  });

  test("no handlers: the state only, with no button at all", async () => {
    await render(<TriageControl state="proposed" />);
    for (const state of STATES) {
      await rerender(<TriageControl state={state} />);
      expect(buttons()).toHaveLength(0);
      expect(group().textContent).toBe(TRIAGE_WORDS[state]);
    }
  });

  test("every state × every handler combination shows exactly the buttons it may press, in order", async () => {
    await render(<TriageControl state="proposed" />);
    let cases = 0;
    for (const state of STATES) {
      for (const accept of [false, true]) {
        for (const reject of [false, true]) {
          for (const again of [false, true]) {
            const props: TriageControlProps = {
              state,
              ...(accept ? { onAccept: noop } : {}),
              ...(reject ? { onReject: noop } : {}),
              ...(again ? { onRunAgain: noop } : {}),
            };
            await rerender(<TriageControl {...props} />);
            const expected = [
              ...(accept && state !== "accepted" ? ["Accept"] : []),
              ...(reject && state !== "not_accepted" ? ["Not accepted"] : []),
              ...(again ? ["Run triage again"] : []),
            ];
            expect({ state, accept, reject, again, shown: labels() }).toEqual({ state, accept, reject, again, shown: expected });
            for (const shown of buttons()) {
              expect([shown.type, shown.disabled, shown.tabIndex]).toEqual(["button", false, 0]);
            }
            cases += 1;
          }
        }
      }
    }
    expect(cases).toBe(32);
  });

  test("each button calls its own handler once and no other", async () => {
    const calls: Array<string> = [];
    await render(
      <TriageControl
        state="proposed"
        onAccept={() => calls.push("accept")}
        onReject={() => calls.push("reject")}
        onRunAgain={() => calls.push("again")}
      />,
    );
    await click(button("Accept"));
    expect(calls).toEqual(["accept"]);
    await click(button("Not accepted"));
    expect(calls).toEqual(["accept", "reject"]);
    await click(button("Run triage again"));
    expect(calls).toEqual(["accept", "reject", "again"]);
  });

  test("the buttons are keyboard focusable in reading order", async () => {
    await render(<TriageControl state="conflict" onAccept={noop} onReject={noop} onRunAgain={noop} />);
    for (const shown of buttons()) {
      shown.focus();
      expect(document.activeElement).toBe(shown);
    }
  });

  test("disabled disables every button shown, and a click calls nothing", async () => {
    const calls: Array<string> = [];
    await render(
      <TriageControl
        state="proposed"
        disabled
        onAccept={() => calls.push("accept")}
        onReject={() => calls.push("reject")}
        onRunAgain={() => calls.push("again")}
      />,
    );
    expect(buttons().map((shown) => shown.disabled)).toEqual([true, true, true]);
    for (const shown of buttons()) await click(shown);
    expect(calls).toEqual([]);
    await rerender(<TriageControl state="proposed" onAccept={() => calls.push("accept")} />);
    expect(button("Accept").disabled).toBe(false);
    await click(button("Accept"));
    expect(calls).toEqual(["accept"]);
  });
});

describe("TriageControl: themes and the sheet", () => {
  test("a Conflict chip follows the theme: its color changes between light and dark", async () => {
    installDarkThemeStyles();
    document.documentElement.dataset.theme = "light";
    await render(<TriageControl state="conflict" />);
    const color = () => getComputedStyle(group().querySelector(".sui-triage-state")!).color;
    const light = color();
    document.documentElement.dataset.theme = "dark";
    await rerender(<TriageControl state="conflict" id="dark" />);
    const dark = color();
    expect(light).not.toBe("");
    expect(dark).not.toBe("");
    expect(dark).not.toBe(light);
  });

  test("the sheet is composed into the shipped stylesheet and namespaced", () => {
    expect(smithersUiCss).toContain(triageControlCss.trim());
    expect(triageControlCss.match(/\.[a-z][\w-]*/g)!.every((name) => name.startsWith(".sui-"))).toBe(true);
  });
});
