// The layout probe behind `supportsRichTextEditing`. The suite runs each file in a fresh module registry
// (`--isolate`), so this file's module has never measured.
import { afterAll, expect, test } from "bun:test";
import { supportsRichTextEditing } from "../src/index";

const ownRect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "getBoundingClientRect");

afterAll(() => {
  if (ownRect === undefined) delete (HTMLElement.prototype as Partial<HTMLElement>).getBoundingClientRect;
  else Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", ownRect);
});

test("a document whose measurement throws has no rich editing, and the answer is kept", () => {
  let probes = 0;
  HTMLElement.prototype.getBoundingClientRect = function () {
    probes += 1;
    throw new Error("no layout");
  };
  expect(supportsRichTextEditing()).toBe(false);
  expect(supportsRichTextEditing()).toBe(false);
  expect(probes).toBe(1);
  // The probe element never stays in the document.
  expect(document.body.children).toHaveLength(0);
});
