/** @jsxImportSource react */
// AvatarStack under happy-dom: real createRoot + act, tooltips in their Radix portal. Keyboard activation of the
// avatar buttons is the browser's own, so browser/sharing.browser.test.ts presses Enter and Space in Chromium.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AvatarStack, type AvatarStackPerson, SMITHERS_UI_STYLE_ATTR, smithersUiCss } from "../src/index";
import { personInitial, personLane } from "../src/internal/person";
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
  container ??= document.createElement("div");
  document.body.appendChild(container);
  root ??= createRoot(container);
  const mounted = root;
  await act(async () => mounted.render(element));
}

const PEOPLE: ReadonlyArray<AvatarStackPerson> = [
  { id: "1", name: "maya", title: "maya · Terminal" },
  { id: "2", name: "jo" },
  { id: "3", name: "sam" },
  { id: "4", name: "lee" },
  { id: "5", name: "kim" },
  { id: "6", name: "ali" },
];

const list = () => container!.querySelector<HTMLUListElement>('[data-slot="avatar-stack"]');
const avatars = () => [...container!.querySelectorAll<HTMLElement>('[data-slot="avatar"]')];
const more = () => container!.querySelector<HTMLElement>('[data-slot="avatar-more"]');
const tooltip = () => document.querySelector('[data-slot="tooltip-content"]')?.textContent ?? null;
const focus = (el: HTMLElement) => act(async () => el.focus());
const blur = (el: HTMLElement) => act(async () => el.blur());

describe("AvatarStack", () => {
  test("names the list and each avatar, and shows each person's initial", async () => {
    await render(<AvatarStack people={PEOPLE.slice(0, 3)} />);
    expect(list()!.tagName).toBe("UL");
    expect(list()!.getAttribute("aria-label")).toBe("People here");
    expect(avatars().map((el) => [el.getAttribute("role"), el.getAttribute("aria-label"), el.textContent])).toEqual([
      ["img", "maya", "M"],
      ["img", "jo", "J"],
      ["img", "sam", "S"],
    ]);
    expect(more()).toBeNull();
    expect(container!.querySelector("button")).toBeNull();
  });

  test("takes its accessible name from label, and passes other list props through", async () => {
    await render(<AvatarStack people={PEOPLE.slice(0, 1)} label="Watching" className="host" data-testid="stack" />);
    expect(list()!.getAttribute("aria-label")).toBe("Watching");
    expect(list()!.className).toBe("sui-avatar-stack host");
    expect(list()!.getAttribute("data-testid")).toBe("stack");
  });

  test("renders nothing for no people", async () => {
    await render(<AvatarStack people={[]} />);
    expect(container!.innerHTML).toBe("");
  });

  test("colors a person by id: the same id always takes the same lane, whatever the name", async () => {
    await render(<AvatarStack people={[{ id: "u-42", name: "first" }]} />);
    const lane = avatars()[0]!.getAttribute("data-lane");
    await render(<AvatarStack people={[{ id: "other", name: "x" }, { id: "u-42", name: "renamed" }]} />);
    expect(avatars()[1]!.getAttribute("data-lane")).toBe(lane);
    const lanes = new Set(Array.from({ length: 60 }, (_, index) => personLane(`person-${index}`)));
    expect([...lanes].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("shows max avatars, default four, and folds the rest into one +N named by their names", async () => {
    await render(<AvatarStack people={PEOPLE} />);
    expect(avatars().map((el) => el.getAttribute("aria-label"))).toEqual(["maya", "jo", "sam", "lee"]);
    expect(more()!.textContent).toBe("+2");
    expect(more()!.getAttribute("aria-label")).toBe("kim, ali");
    await focus(more()!);
    expect(tooltip()).toBe("kim, ali");

    await render(<AvatarStack people={PEOPLE} max={2} />);
    expect(avatars()).toHaveLength(2);
    expect(more()!.textContent).toBe("+4");

    await render(<AvatarStack people={PEOPLE} max={6} />);
    expect(avatars()).toHaveLength(6);
    expect(more()).toBeNull();

    await render(<AvatarStack people={PEOPLE.slice(0, 2)} max={0} />);
    expect(avatars()).toHaveLength(0);
    expect(more()!.textContent).toBe("+2");

    await render(<AvatarStack people={PEOPLE} max={Number.NaN} />);
    expect(avatars()).toHaveLength(4);
  });

  test("with onSelect each avatar is a button named by its person that follows them on click", async () => {
    const followed: Array<string> = [];
    await render(<AvatarStack people={PEOPLE.slice(0, 3)} onSelect={(id) => followed.push(id)} />);
    const buttons = avatars();
    expect(buttons.map((el) => [el.tagName, el.getAttribute("type"), el.getAttribute("aria-label")])).toEqual([
      ["BUTTON", "button", "maya"],
      ["BUTTON", "button", "jo"],
      ["BUTTON", "button", "sam"],
    ]);
    await act(async () => buttons[1]!.click());
    await act(async () => buttons[0]!.click());
    expect(followed).toEqual(["2", "1"]);
  });

  test("an avatar's tooltip is its title, or its name without one", async () => {
    await render(<AvatarStack people={PEOPLE.slice(0, 2)} onSelect={() => {}} />);
    await focus(avatars()[0]!);
    expect(tooltip()).toBe("maya · Terminal");
    await blur(avatars()[0]!);
    await focus(avatars()[1]!);
    expect(tooltip()).toBe("jo");
  });

  test("an initial is the name's first letter or digit, upper-cased", () => {
    expect(personInitial("maya")).toBe("M");
    expect(personInitial("_x-bot")).toBe("X");
    expect(personInitial("9lives")).toBe("9");
    expect(personInitial("élodie")).toBe("É");
    expect(personInitial(" 🦊 ")).toBe("🦊");
    expect(personInitial("")).toBe("");
  });

  test("paints the six lanes from the host's lane palette, else the theme's own hues, with a ring in the page background", () => {
    for (const lane of [0, 1, 2, 3, 4, 5]) {
      expect(smithersUiCss).toContain(`.sui-avatar[data-lane='${lane}'] { --sui-avatar-lane:var(--lane-${lane}, var(--`);
    }
    expect(smithersUiCss).toContain("color:var(--avatar-ink, var(--inverse-text, #f7f4ee))");
    expect(smithersUiCss).toContain("box-shadow:0 0 0 2px var(--sui-avatar-ring, var(--bg, #f7f4ee))");
  });
});
