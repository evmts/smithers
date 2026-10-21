/** @jsxImportSource react */
// Kbd under happy-dom: a real <kbd> with the host's props, styled by the composed sheet.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Kbd, kbdCss, SMITHERS_UI_STYLE_ATTR, smithersUiCss } from "../src/index";
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

describe("Kbd", () => {
  test("renders a kbd chip with the host's props and class", async () => {
    await render(
      <Kbd className="host" title="Open search" aria-label="Command K" data-key="k">
        ⌘K
      </Kbd>,
    );
    const kbd = container!.querySelector("kbd")!;
    expect(kbd.textContent).toBe("⌘K");
    expect(kbd.className).toBe("sui-kbd host");
    expect(kbd.getAttribute("data-slot")).toBe("kbd");
    expect(kbd.getAttribute("title")).toBe("Open search");
    expect(kbd.getAttribute("aria-label")).toBe("Command K");
    expect(kbd.getAttribute("data-key")).toBe("k");
  });

  test("injects the sheet, whose chip is mono with a 2px bottom edge on the theme tokens", async () => {
    await render(<Kbd>esc</Kbd>);
    expect(document.querySelector(`style[${SMITHERS_UI_STYLE_ATTR}]`)?.textContent).toBe(smithersUiCss);
    expect(smithersUiCss).toContain(kbdCss.trim());
    const rule = kbdCss.match(/\.sui-kbd \{[^}]+\}/)![0];
    expect(rule).toContain("border:1px solid var(--border-strong,");
    expect(rule).toContain("border-bottom-width:2px");
    expect(rule).toContain("border-radius:4px");
    expect(rule).toContain("color:var(--text-muted,");
    expect(rule).toContain("background:var(--surface,");
    expect(rule).toContain("var(--font-mono,");
  });
});
