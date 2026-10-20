/** @jsxImportSource react */
// The value disclosure under happy-dom: real createRoot + act.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { formatBytes, JsonValue, jsonValueText, smithersUiCss } from "../src";
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

describe("jsonValueText", () => {
  test("pretty-prints whole JSON, shows a JSON string's own text, and leaves anything else as written", () => {
    expect(jsonValueText({ text: '{"a":1,"b":[true]}', bytes: 18, clipped: false })).toBe(
      '{\n  "a": 1,\n  "b": [\n    true\n  ]\n}',
    );
    expect(jsonValueText({ text: '"## Changes"', bytes: 12, clipped: false })).toBe("## Changes");
    expect(jsonValueText({ text: "not json", bytes: 8, clipped: false })).toBe("not json");
  });

  test("never reformats a clipped value: it is a cut string", () => {
    expect(jsonValueText({ text: '{"a":1}', bytes: 40_000, clipped: true })).toBe('{"a":1}');
    expect(jsonValueText({ text: '{"a":"tru', bytes: 40_000, clipped: true })).toBe('{"a":"tru');
  });
});

describe("formatBytes", () => {
  test("bytes, then kilobytes and megabytes of 1,024", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(16 * 1024)).toBe("16 KB");
    expect(formatBytes(2.3 * 1024 * 1024)).toBe("2.3 MB");
    expect(formatBytes(5 * 1024 ** 4)).toBe("5120 GB");
  });

  test("an unreadable or negative size is 0 B", () => {
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
  });
});

describe("JsonValue", () => {
  test("a closed disclosure named by its label and size, with the value as text", async () => {
    await render(<JsonValue label="Output" value={{ text: '{"length":5}', bytes: 12, clipped: false }} />);
    const details = $<HTMLDetailsElement>("[data-slot='json-value']")!;
    expect(details.open).toBe(false);
    expect(details.dataset.clipped).toBeUndefined();
    expect($(".sui-json-value-label")!.textContent).toBe("Output");
    expect($(".sui-json-value-size")!.textContent).toBe("12 B");
    expect($(".sui-json-value-clipped")).toBeNull();
    expect($("pre")!.textContent).toBe('{\n  "length": 5\n}');
  });

  test("open by default when asked, and marks a clipped value", async () => {
    await render(<JsonValue label="Input" defaultOpen value={{ text: "x".repeat(10), bytes: 40_000, clipped: true }} />);
    expect($<HTMLDetailsElement>("details")!.open).toBe(true);
    expect($("details")!.dataset.clipped).toBe("true");
    expect($(".sui-json-value-clipped")!.textContent).toBe("Clipped");
    expect($(".sui-json-value-size")!.textContent).toBe("39 KB");
  });

  test("renders markup in a value as text, never as elements", async () => {
    await render(<JsonValue label="Output" value={{ text: '"<img src=x onerror=alert(1)>"', bytes: 30, clipped: false }} />);
    expect($("pre")!.textContent).toBe("<img src=x onerror=alert(1)>");
    expect($("img")).toBeNull();
  });

  test("its sheet is part of smithersUiCss", () => {
    expect(smithersUiCss).toContain(".sui-json-value-clipped");
  });
});
