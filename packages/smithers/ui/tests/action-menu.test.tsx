/** @jsxImportSource react */
// ActionMenu and ConfirmButton under happy-dom: real createRoot + act, native events. Radix opens a menu from the
// keyboard (Enter, Space, ArrowDown) and from pointerdown; the tests drive the keyboard, as a person without a mouse.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ActionMenu, actionMenuCss, type ActionMenuItem, ConfirmButton, SMITHERS_UI_STYLE_ATTR, smithersUiCss } from "../src/index";
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

async function key(el: Element, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

const trigger = () => document.querySelector<HTMLButtonElement>("[data-slot=action-menu-trigger]")!;
const menu = () => document.querySelector<HTMLElement>("[data-slot=action-menu]");
const items = () => [...document.querySelectorAll<HTMLElement>("[role=menuitem]")];
const dialog = () => document.querySelector<HTMLElement>("[role=dialog]");
const buttonIn = (scope: Element, name: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === name)!;

describe("ActionMenu", () => {
  test("a quiet ⋯ button named by its label; Enter opens its items, in order", async () => {
    await render(<ActionMenu label="T4 actions" items={[{ label: "Drop", onSelect: () => {} }, { label: "Run", onSelect: () => {} }]} />);
    expect(trigger().getAttribute("aria-label")).toBe("T4 actions");
    expect(trigger().className).toContain("sui-button-ghost");
    expect(trigger().textContent).toBe("");
    expect(menu()).toBeNull();
    await key(trigger(), { key: "Enter" });
    expect(menu()).not.toBeNull();
    expect(items().map((item) => item.textContent)).toEqual(["Drop", "Run"]);
  });

  test("an item without confirm runs at once and closes the menu", async () => {
    const ran: Array<string> = [];
    await render(<ActionMenu label="Actions" items={[{ label: "Run", onSelect: () => ran.push("run") }]} />);
    await key(trigger(), { key: "Enter" });
    await click(items()[0]!);
    expect(ran).toEqual(["run"]);
    expect(menu()).toBeNull();
    expect(dialog()).toBeNull();
  });

  test("an item with confirm asks first, Cancel focused; Cancel runs nothing", async () => {
    const ran: Array<string> = [];
    const drop: ActionMenuItem = {
      label: "Drop",
      destructive: true,
      onSelect: () => ran.push("drop"),
      confirm: { title: "Drop T4?", description: "README line", action: "Drop" },
    };
    await render(<ActionMenu label="T4 actions" items={[drop]} />);
    await key(trigger(), { key: "Enter" });
    expect(items()[0]!.dataset.destructive).toBe("true");
    await click(items()[0]!);
    expect(ran).toEqual([]);
    const asked = dialog()!;
    expect(asked.querySelector("[data-slot=dialog-title]")!.textContent).toBe("Drop T4?");
    expect(asked.querySelector("[data-slot=dialog-description]")!.textContent).toBe("README line");
    expect(asked.querySelector(".sui-dialog-close")).toBeNull();
    expect(document.activeElement).toBe(buttonIn(asked, "Cancel"));
    expect(buttonIn(asked, "Drop").className).toContain("sui-button-destructive");
    await click(buttonIn(asked, "Cancel"));
    expect(dialog()).toBeNull();
    expect(ran).toEqual([]);
  });

  test("the dialog's action runs the item once and returns the focus to the trigger", async () => {
    const ran: Array<string> = [];
    await render(
      <ActionMenu
        label="T4 actions"
        items={[{ label: "Archive", onSelect: () => ran.push("archive"), confirm: { title: "Archive T4?", action: "Archive" } }]}
      />,
    );
    await key(trigger(), { key: "Enter" });
    await click(items()[0]!);
    const asked = dialog()!;
    expect(asked.querySelector("[data-slot=dialog-description]")).toBeNull();
    expect(buttonIn(asked, "Archive").className).toContain("sui-button-default");
    await click(buttonIn(asked, "Archive"));
    expect(ran).toEqual(["archive"]);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  test("Escape in the dialog closes it without running the item", async () => {
    const ran: Array<string> = [];
    await render(
      <ActionMenu label="A" items={[{ label: "Drop", onSelect: () => ran.push("drop"), confirm: { title: "Drop?", action: "Drop" } }]} />,
    );
    await key(trigger(), { key: "Enter" });
    await click(items()[0]!);
    await key(dialog()!, { key: "Escape" });
    expect(dialog()).toBeNull();
    expect(ran).toEqual([]);
  });

  test("a host className and button props reach the trigger", async () => {
    await render(<ActionMenu label="A" items={[]} className="row-menu" disabled />);
    expect(trigger().className).toContain("sui-action-menu-trigger");
    expect(trigger().className).toContain("row-menu");
    expect(trigger().disabled).toBe(true);
  });
});

describe("ConfirmButton", () => {
  test("asks before it acts: the dialog's action runs onConfirm once; Cancel never does", async () => {
    let confirmed = 0;
    await render(
      <ConfirmButton variant="ghost" destructive confirm={{ title: "Drop T4?", action: "Drop" }} onConfirm={() => (confirmed += 1)}>
        Drop
      </ConfirmButton>,
    );
    const button = document.querySelector<HTMLButtonElement>("[data-slot=confirm-button]")!;
    expect([button.textContent, button.className.includes("sui-button-ghost")]).toEqual(["Drop", true]);
    expect(dialog()).toBeNull();
    await click(button);
    expect(document.activeElement).toBe(buttonIn(dialog()!, "Cancel"));
    await click(buttonIn(dialog()!, "Cancel"));
    expect([dialog(), confirmed]).toEqual([null, 0]);
    await click(button);
    const action = [...dialog()!.querySelectorAll<HTMLButtonElement>("button")].at(-1)!;
    expect([action.textContent, action.className.includes("sui-button-destructive")]).toEqual(["Drop", true]);
    await click(action);
    expect([dialog(), confirmed]).toEqual([null, 1]);
  });

  test("without destructive the dialog's action is the default button", async () => {
    await render(
      <ConfirmButton confirm={{ title: "Run?", action: "Run" }} onConfirm={() => {}}>
        Run
      </ConfirmButton>,
    );
    await click(document.querySelector("[data-slot=confirm-button]")!);
    expect(buttonIn(dialog()!, "Run").className).toContain("sui-button-default");
  });
});

describe("actionMenuCss", () => {
  test("is part of the sheet, sui- namespaced, with a danger item and a highlighted fill", () => {
    expect(smithersUiCss).toContain(actionMenuCss.trim());
    expect(actionMenuCss.match(/\.[a-z][\w-]*/g)!.every((name) => name.startsWith(".sui-"))).toBe(true);
    expect(actionMenuCss).toContain(".sui-action-menu-item[data-destructive]");
    expect(actionMenuCss).toContain(".sui-action-menu-item[data-highlighted]");
  });
});
