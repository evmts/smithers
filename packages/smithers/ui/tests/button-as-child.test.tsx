/** @jsxImportSource react */
// Under `asChild`, a disabled or loading Button must make the slotted element
// inert. Anchors ignore the `disabled` attribute, so without a capture-phase
// guard a loading link still ran its onClick and navigated.
import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Button } from "../src/button";

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
});

async function renderLink(element: ReactElement): Promise<HTMLAnchorElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  await act(async () => mounted.render(element));
  const link = container.querySelector("a");
  if (!link) throw new Error("no slotted anchor");
  return link;
}

async function dispatch(target: HTMLElement, event: Event): Promise<Event> {
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}

const click = () => new MouseEvent("click", { bubbles: true, cancelable: true });
const key = (k: string) => new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });

describe("Button asChild activation", () => {
  for (const state of ["loading", "disabled"] as const) {
    test(`${state} slotted link ignores click, Enter, and Space`, async () => {
      const onClick = mock(() => {});
      const onKeyDown = mock(() => {});
      const link = await renderLink(
        <Button asChild loading={state === "loading"} disabled={state === "disabled"}>
          <a href="/runs" onClick={onClick} onKeyDown={onKeyDown}>
            Open runs
          </a>
        </Button>,
      );
      expect(link.getAttribute("aria-disabled")).toBe("true");

      expect((await dispatch(link, click())).defaultPrevented).toBe(true);
      expect((await dispatch(link, key("Enter"))).defaultPrevented).toBe(true);
      expect((await dispatch(link, key(" "))).defaultPrevented).toBe(true);
      expect(onClick).not.toHaveBeenCalled();
      expect(onKeyDown).not.toHaveBeenCalled();

      // Tab still reaches the element and its handler, so it stays focusable.
      expect((await dispatch(link, key("Tab"))).defaultPrevented).toBe(false);
      expect(onKeyDown).toHaveBeenCalledTimes(1);
    });
  }

  test("enabled slotted link runs its click handler", async () => {
    const onClick = mock(() => {});
    const link = await renderLink(
      <Button asChild>
        <a href="/runs" onClick={(event) => { event.preventDefault(); onClick(); }}>
          Open runs
        </a>
      </Button>,
    );
    expect(link.hasAttribute("aria-disabled")).toBe(false);
    await dispatch(link, click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("caller aria props cannot override loading semantics", async () => {
    const link = await renderLink(
      <Button asChild loading aria-disabled={false} aria-busy={false}>
        <a href="/runs">Open runs</a>
      </Button>,
    );
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.getAttribute("aria-busy")).toBe("true");
  });

  test("an idle button keeps the caller's own aria-busy", async () => {
    const link = await renderLink(
      <Button asChild aria-busy>
        <a href="/runs">Open runs</a>
      </Button>,
    );
    expect(link.getAttribute("aria-busy")).toBe("true");
  });

  for (const state of ["loading", "disabled"] as const) {
    test(`${state} slotted link never runs child capture handlers`, async () => {
      const onClickCapture = mock(() => {});
      const onKeyDownCapture = mock(() => {});
      const link = await renderLink(
        <Button asChild loading={state === "loading"} disabled={state === "disabled"}>
          <a href="#next" onClickCapture={onClickCapture} onKeyDownCapture={onKeyDownCapture}>
            Launch
          </a>
        </Button>,
      );
      expect((await dispatch(link, click())).defaultPrevented).toBe(true);
      await dispatch(link, key("Enter"));
      await dispatch(link, key(" "));
      await dispatch(link, key("Tab"));
      expect(onClickCapture).not.toHaveBeenCalled();
      expect(onKeyDownCapture).not.toHaveBeenCalled();
    });
  }

  test("enabled slotted link still runs child capture handlers", async () => {
    const onClickCapture = mock(() => {});
    const onKeyDownCapture = mock(() => {});
    const link = await renderLink(
      <Button asChild>
        <a href="#next" onClickCapture={onClickCapture} onKeyDownCapture={onKeyDownCapture}>
          Launch
        </a>
      </Button>,
    );
    await dispatch(link, click());
    await dispatch(link, key("Enter"));
    expect(onClickCapture).toHaveBeenCalledTimes(1);
    expect(onKeyDownCapture).toHaveBeenCalledTimes(1);
  });
});

for (const type of ["button", "submit", "reset"] as const) {
  test(`slotted button receives explicit ${type} type`, async () => {
    await renderLink(<form><Button asChild type={type}><button>Act</button></Button><a href="#">helper</a></form>);
    expect(container!.querySelector("button")!.type).toBe(type);
  });
}

test("explicit slotted button type prevents accidental form submission", async () => {
  let submissions = 0;
  await renderLink(<form onSubmit={(event) => { event.preventDefault(); submissions++; }}><Button asChild type="button"><button>Act</button></Button><a href="#">helper</a></form>);
  await act(async () => container!.querySelector("button")!.click());
  expect(submissions).toBe(0);
});

test("a child's explicit type takes precedence and links get no default type", async () => {
  const link = await renderLink(<div><Button asChild type="submit"><button type="reset">Reset</button></Button><Button asChild><a href="#">Link</a></Button></div>);
  expect(container!.querySelector("button")!.type).toBe("reset");
  expect(link.hasAttribute("type")).toBe(false);
});
