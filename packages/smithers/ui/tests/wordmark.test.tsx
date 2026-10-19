import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Wordmark, WORDMARK } from "../src/wordmark/Wordmark";
import { smithersUiCss } from "../src/uiCss";

describe("Wordmark", () => {
  test("keeps every row the same width", () => {
    expect(new Set(WORDMARK.map((row) => [...row].length)).size).toBe(1);
  });

  test("renders one row per line, hidden from assistive technology", () => {
    const html = renderToStaticMarkup(<Wordmark className="extra" />);
    expect(html).toStartWith('<pre class="sui-wordmark extra" aria-hidden="true">');
    expect(html.match(/class="sui-wordmark-row"/g)).toHaveLength(WORDMARK.length);
    expect(html).toContain("--sui-wordmark-row:5");
  });

  test("ships its styles in the component sheet", () => {
    expect(smithersUiCss).toContain(".sui-wordmark {");
    expect(smithersUiCss).toContain("@keyframes sui-wordmark-scan");
  });
});
