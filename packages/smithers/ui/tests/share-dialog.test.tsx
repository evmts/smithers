/** @jsxImportSource react */
// ShareDialog under happy-dom: real createRoot + act, the Dialog and each Select's listbox in their Radix portals,
// as a browser renders them. The host's state lives in a test harness, so every callback is seen as the host sees it.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  type ShareAccess,
  ShareDialog,
  type ShareDialogProps,
  type ShareGeneral,
  type SharePerson,
  SMITHERS_UI_STYLE_ATTR,
} from "../src/index";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement | undefined;
let root: Root | undefined;
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

afterEach(async () => {
  if (root) {
    const mounted = root;
    await act(async () => mounted.unmount());
    root = undefined;
  }
  container?.remove();
  container = undefined;
  document.querySelectorAll(`style[${SMITHERS_UI_STYLE_ATTR}]`).forEach((el) => el.remove());
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else delete (navigator as { clipboard?: Clipboard }).clipboard;
});

async function render(element: ReactElement): Promise<void> {
  container ??= document.createElement("div");
  document.body.appendChild(container);
  root ??= createRoot(container);
  const mounted = root;
  await act(async () => mounted.render(element));
}

const PEOPLE: ReadonlyArray<SharePerson> = [
  { id: "u1", name: "maya", access: "owner" },
  { id: "u2", name: "jo", access: "edit" },
  { id: "u3", name: "sam", access: "view" },
];

type Call =
  | ["add", string, ShareAccess]
  | ["access", string, ShareAccess]
  | ["remove", string]
  | ["general", ShareGeneral]
  | ["open", boolean];

/** The dialog with every callback recorded, over `overrides`. */
async function share(overrides: Partial<ShareDialogProps> = {}): Promise<Array<Call>> {
  const calls: Array<Call> = [];
  await render(
    <ShareDialog
      open
      onOpenChange={(open) => calls.push(["open", open])}
      title="Share test-branch"
      people={PEOPLE}
      self="u3"
      general="restricted"
      groupLabel="Anyone in this repository with the link"
      link="https://smithers.sh/maya/tinyhttp/branch/test-branch"
      onAdd={(name, access) => calls.push(["add", name, access])}
      onAccessChange={(id, access) => calls.push(["access", id, access])}
      onRemove={(id) => calls.push(["remove", id])}
      onGeneralChange={(general) => calls.push(["general", general])}
      {...overrides}
    />,
  );
  return calls;
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const named = <T extends HTMLElement>(label: string) =>
  dialog()!.querySelector<T>(`[aria-label="${label}"]`);
const input = () => named<HTMLInputElement>("Add people")!;
const button = (text: string) =>
  [...dialog()!.querySelectorAll<HTMLButtonElement>("button")].find((el) => el.textContent === text);
const rows = () => [...dialog()!.querySelectorAll<HTMLLIElement>(".sui-share-person")];
const generalSelect = () => {
  const headingId = [...dialog()!.querySelectorAll("h3")].find((h) => h.textContent === "General access")!.id;
  return dialog()!.querySelector<HTMLButtonElement>(`[aria-labelledby="${headingId}"]`)!;
};

async function type(value: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function key(el: Element, name: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init })));
}

const click = (el: HTMLElement) => act(async () => el.click());

/** Opens a Select from its trigger and picks the option showing `text`. */
async function choose(trigger: HTMLElement, text: string): Promise<void> {
  await click(trigger);
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((el) => el.textContent === text);
  if (option === undefined) throw new Error(`no option ${text}`);
  await click(option);
}

describe("ShareDialog", () => {
  test("shows the title, the add row, people with access in order, general access and the footer, in those words only", async () => {
    await share();
    expect(dialog()!.querySelector("h2")!.textContent).toBe("Share test-branch");
    expect(dialog()!.getAttribute("aria-labelledby")).toBe(dialog()!.querySelector("h2")!.id);
    expect(input().placeholder).toBe("Add people");
    expect(named("Access")!.textContent).toBe("Can view");
    expect(rows().map((row) => row.querySelector(".sui-share-name")!.textContent)).toEqual(["maya", "jo", "sam (you)"]);
    expect(dialog()!.querySelector('[aria-label="Close"]')).toBeNull();
    const words = [...dialog()!.querySelectorAll("h2, button, h3, .sui-avatar, .sui-share-name, .sui-share-owner")].map((el) => el.textContent);
    expect(words).toEqual([
      "Share test-branch",
      "Can view",
      "Share",
      "People with access",
      "M",
      "maya",
      "Owner",
      "J",
      "jo",
      "Can edit",
      "Remove",
      "S",
      "sam (you)",
      "Can view",
      "Remove",
      "General access",
      "Restricted",
      "Copy link",
      "Done",
    ]);
    expect(dialog()!.textContent).toBe(words.join(""));
  });

  test("the owner's row reads Owner and has no controls; every other row has its access and Remove", async () => {
    await share();
    const [owner, jo, sam] = rows();
    expect(owner!.querySelectorAll("button")).toHaveLength(0);
    expect(owner!.querySelector(".sui-share-owner")!.textContent).toBe("Owner");
    expect(jo!.querySelector('[aria-label="Access for jo"]')!.textContent).toBe("Can edit");
    expect(jo!.querySelector('[aria-label="Remove jo"]')!.textContent).toBe("Remove");
    expect(sam!.querySelector('[aria-label="Access for sam"]')!.textContent).toBe("Can view");
    expect(owner!.querySelector(".sui-avatar")!.textContent).toBe("M");
    expect(owner!.querySelector(".sui-avatar")!.getAttribute("aria-hidden")).toBe("true");
  });

  test("Share adds the trimmed name at the chosen access, then clears the input and keeps focus there", async () => {
    const calls = await share();
    expect(button("Share")!.disabled).toBe(true);
    await type("   ");
    expect(button("Share")!.disabled).toBe(true);
    await type("  lee ");
    expect(button("Share")!.disabled).toBe(false);
    await click(button("Share")!);
    expect(calls).toEqual([["add", "lee", "view"]]);
    expect(input().value).toBe("");
    expect(button("Share")!.disabled).toBe(true);
    expect(document.activeElement).toBe(input());

    await choose(named("Access")!, "Can edit");
    await type("kim");
    await click(button("Share")!);
    expect(calls).toEqual([["add", "lee", "view"], ["add", "kim", "edit"]]);
    expect(named("Access")!.textContent).toBe("Can edit");
  });

  test("Enter in the input shares too, but not while it is blank or composing", async () => {
    const calls = await share();
    await key(input(), "Enter");
    await type("ali");
    await key(input(), "a");
    await key(input(), "Enter", { isComposing: true });
    expect(calls).toEqual([]);
    await key(input(), "Enter");
    expect(calls).toEqual([["add", "ali", "view"]]);
    expect(input().value).toBe("");
  });

  test("changing a person's access or removing them calls back with their id", async () => {
    const calls = await share();
    await choose(named("Access for jo")!, "Can view");
    await choose(named("Access for sam")!, "Can edit");
    await click(named("Remove jo")!);
    expect(calls).toEqual([["access", "u2", "view"], ["access", "u3", "edit"], ["remove", "u2"]]);
  });

  test("pending people's controls are disabled, and only theirs", async () => {
    const calls = await share({ pending: ["u2"] });
    const [, jo, sam] = rows();
    expect(jo!.getAttribute("data-pending")).toBe("true");
    expect(named<HTMLButtonElement>("Access for jo")!.disabled).toBe(true);
    expect(named<HTMLButtonElement>("Remove jo")!.disabled).toBe(true);
    await click(named("Remove jo")!);
    expect(sam!.hasAttribute("data-pending")).toBe(false);
    expect(named<HTMLButtonElement>("Access for sam")!.disabled).toBe(false);
    expect(named<HTMLButtonElement>("Remove sam")!.disabled).toBe(false);
    expect(calls).toEqual([]);
  });

  test("the error shows under the add row as an alert that describes the input", async () => {
    await share();
    expect(dialog()!.querySelector('[role="alert"]')).toBeNull();
    expect(input().hasAttribute("aria-invalid")).toBe(false);
    await share({ error: "No such person" });
    const alert = dialog()!.querySelector<HTMLElement>('[role="alert"]')!;
    expect(alert.textContent).toBe("No such person");
    expect(alert.previousElementSibling!.className).toBe("sui-share-add");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(input().getAttribute("aria-describedby")).toBe(alert.id);
  });

  test("general access switches between Restricted and the group, and the group's link access between view and edit", async () => {
    const calls = await share();
    expect(generalSelect().textContent).toBe("Restricted");
    expect(named("Link access")).toBeNull();
    expect(dialog()!.querySelector(".sui-share-general-icon")!.getAttribute("data-general")).toBe("restricted");
    await choose(generalSelect(), "Anyone in this repository with the link");
    expect(calls).toEqual([["general", "view"]]);

    await share({ general: "edit" });
    expect(generalSelect().textContent).toBe("Anyone in this repository with the link");
    expect(named("Link access")!.textContent).toBe("Can edit");
    expect(dialog()!.querySelector(".sui-share-general-icon")!.getAttribute("data-general")).toBe("link");
    const later = await share({ general: "edit" });
    await choose(named("Link access")!, "Can view");
    await choose(generalSelect(), "Restricted");
    expect(later).toEqual([["general", "view"], ["general", "restricted"]]);
  });

  test("Copy link copies the link and says Copied", async () => {
    const copied: Array<string> = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void copied.push(text) },
    });
    await share();
    await click(button("Copy link")!);
    await act(async () => await Promise.resolve());
    expect(copied).toEqual(["https://smithers.sh/maya/tinyhttp/branch/test-branch"]);
    expect(dialog()!.querySelector('[data-slot="copy-button"]')!.textContent).toBe("Copied");
  });

  test("a refused copy is marked failed, not Copied", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    });
    const execCommand = document.execCommand;
    document.execCommand = () => false;
    try {
      await share();
      await click(button("Copy link")!);
      await act(async () => await Promise.resolve());
      const copy = dialog()!.querySelector('[data-slot="copy-button"]')!;
      expect(copy.getAttribute("data-copy-failed")).toBe("true");
      expect(copy.textContent).toBe("Copy link");
    } finally {
      document.execCommand = execCommand;
    }
  });

  test("Done and Escape close through onOpenChange; closed, nothing renders", async () => {
    const calls = await share();
    await click(button("Done")!);
    await key(dialog()!, "Escape");
    expect(calls).toEqual([["open", false], ["open", false]]);
    await share({ open: false });
    expect(dialog()).toBeNull();
  });
});
