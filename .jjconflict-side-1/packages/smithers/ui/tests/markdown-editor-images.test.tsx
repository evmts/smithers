/** @jsxImportSource react */
// Image round trips through the real Milkdown Crepe editor (#3903).
//
// Crepe's ImageBlock feature stores an image's display ratio in the Markdown
// alt field, so `![A terminal recording](assets/demo.gif)` came back as
// `![1.00](assets/demo.gif)` for every image in an edited document. These
// tests load the real editor modules (no `loadEditor` stub) and read the
// document back through the component's own handle and `onChange`.
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MARKDOWN_EDITOR_STYLE_ATTR, MarkdownEditor, type MarkdownEditorHandle } from "../src/adapters/markdown-editor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const post = [
  "# Flows",
  "",
  "![A terminal recording of a flow](assets/demo.gif)",
  "",
  "Run it once.",
  "",
  "![The run card](assets/card.png \"A finished run\")",
  "",
  "See ![the logo](assets/logo.svg) beside the title.",
  "",
].join("\n");

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
  document.querySelectorAll(`style[${MARKDOWN_EDITOR_STYLE_ATTR}]`).forEach((el) => el.remove());
});

/** Mount the real editor and wait until it reports ready. */
async function mountEditor(onChange?: (markdown: string) => void): Promise<{ handle: MarkdownEditorHandle; content: HTMLElement }> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  let handle: MarkdownEditorHandle | null = null;
  await act(async () =>
    mounted.render(
      <MarkdownEditor ref={(value) => { handle = value; }} value={post} aria-label="Post" fallback={false} onChange={onChange} />,
    )
  );
  // The adapter labels the ProseMirror content only once the editor is ready;
  // before that, getMarkdown returns the seed without asking the editor.
  const deadline = Date.now() + 10_000;
  for (;;) {
    const content = container.querySelector<HTMLElement>('.ProseMirror[aria-label="Post"]');
    if (content && handle) return { handle, content };
    if (Date.now() > deadline) throw new Error("the real editor never became ready");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
}

describe("MarkdownEditor images (real Crepe)", () => {
  test("an untouched document keeps every image's alt text and title", async () => {
    const { handle, content } = await mountEditor();
    expect(handle.getMarkdown()).toBe(post);
    expect([...content.querySelectorAll("img")].map((img) => img.getAttribute("alt"))).toEqual([
      "A terminal recording of a flow",
      "The run card",
      "the logo",
    ]);
  });

  test("a peer update keeps the alt text of images it never touched", async () => {
    const { handle } = await mountEditor();
    const updated = post.replace("Run it once.", "Run it twice.");
    await act(async () => handle.setMarkdown(updated));
    expect(handle.getMarkdown()).toBe(updated);
  });

  test("a local edit publishes every image with its alt text", async () => {
    const changes: string[] = [];
    const { content } = await mountEditor((markdown) => changes.push(markdown));
    const paragraph = [...content.querySelectorAll("p")].find((p) => p.textContent === "Run it once.");
    const text = paragraph?.firstChild;
    if (!(text instanceof Text)) throw new Error("paragraph text not rendered");
    await act(async () => {
      text.data = "Run it twice.";
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(changes.at(-1)).toBe(post.replace("Run it once.", "Run it twice."));
  });
});
