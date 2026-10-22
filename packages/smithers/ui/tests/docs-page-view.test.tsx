/** @jsxImportSource react */
// DocsPageView under happy-dom: real createRoot + act.
import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DocsPageView, docsPageCss, docsPageTarget, smithersUiCss } from "../src/index";
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

async function render(element: ReactElement): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  await act(async () => mounted.render(element));
  return container;
}

const URL_ = "https://vibelang.sh/error-management/018-retrying.md";
const TEXT = [
  "Retry a failing effect with a **schedule**.",
  "",
  "See [Vite](/setup/vite.md), [next](./019-timeouts.md) and [Effect](https://effect.website/docs).",
  "",
  "<script>window.__docsPwned = true</script>",
  "<img src=x onerror=\"window.__docsPwned = true\">",
  "[bad](javascript:alert(1))",
].join("\n");

describe("DocsPageView", () => {
  test("draws the origin, Open on site, the title as a heading and the page's Markdown", async () => {
    const view = await render(<DocsPageView title="Retrying" url={URL_} text={TEXT} />);
    const article = view.querySelector("article[data-slot='docs-page-view']")!;
    expect(article.getAttribute("data-size")).toBe("inline");
    expect(view.querySelector("[data-slot='docs-page-origin']")!.textContent).toBe("https://vibelang.sh");
    const open = view.querySelector<HTMLAnchorElement>("a[data-slot='docs-page-open']")!;
    expect(open.textContent).toBe("Open on site");
    expect(open.getAttribute("href")).toBe(URL_);
    expect(open.getAttribute("target")).toBe("_blank");
    expect(open.getAttribute("rel")).toBe("noopener noreferrer");
    const heading = view.querySelector("h2")!;
    expect(heading.textContent).toBe("Retrying");
    expect(view.querySelector("strong")!.textContent).toBe("schedule");
    expect(view.querySelector("[data-slot='docs-page-truncated']")).toBeNull();
    expect(document.querySelector(`style[${SMITHERS_UI_STYLE_ATTR}]`)?.textContent).toContain(".sui-docs-page-view");
  });

  test("renders no element from HTML in the text, and no unsafe link", async () => {
    const view = await render(<DocsPageView title="Retrying" url={URL_} text={TEXT} />);
    expect(view.querySelector("script")).toBeNull();
    expect(view.querySelector("img")).toBeNull();
    expect((globalThis as { __docsPwned?: boolean }).__docsPwned).toBeUndefined();
    const bad = [...view.querySelectorAll("a")].find((a) => a.textContent === "bad")!;
    expect(bad.hasAttribute("href")).toBe(false);
    expect(view.innerHTML).not.toContain("javascript:");
  });

  test("resolves relative links against the page, on the docs site", async () => {
    const view = await render(<DocsPageView title="Retrying" url={URL_} text={TEXT} />);
    const href = (label: string) => [...view.querySelectorAll("a")].find((a) => a.textContent === label)!.getAttribute("href");
    expect(href("Vite")).toBe("https://vibelang.sh/setup/vite.md");
    expect(href("next")).toBe("https://vibelang.sh/error-management/019-timeouts.md");
    expect(href("Effect")).toBe("https://effect.website/docs");
  });

  test("hands a link to onLinkClick, resolved", async () => {
    const clicked: string[] = [];
    const view = await render(
      <DocsPageView title="Retrying" url={URL_} text="[Vite](/setup/vite.md)" onLinkClick={(href) => clicked.push(href)} />,
    );
    await act(async () => view.querySelector<HTMLAnchorElement>("a.sui-md-link")!.click());
    expect(clicked).toEqual(["https://vibelang.sh/setup/vite.md"]);
  });

  test("says Shortened after a truncated page, fills its container at full size, and takes a heading level and actions", async () => {
    const view = await render(
      <DocsPageView title="Retrying" url={URL_} text="Start" truncated size="full" headingLevel={1} actions={<button type="button">Full screen</button>} />,
    );
    expect(view.querySelector("[data-slot='docs-page-view']")!.getAttribute("data-size")).toBe("full");
    expect(view.querySelector("[data-slot='docs-page-truncated']")!.textContent).toBe("Shortened");
    expect(view.querySelector("h1")!.textContent).toBe("Retrying");
    const actions = view.querySelector("[data-slot='docs-page-actions']")!;
    expect(actions.firstElementChild!.textContent).toBe("Full screen");
  });

  test("refuses a URL that isn't an http(s) page without credentials", async () => {
    for (const url of ["javascript:alert(1)", "/relative.md", "https://user:pw@vibelang.sh/x.md", "data:text/plain,x"]) {
      const view = await render(<DocsPageView title="Retrying" url={url} text={TEXT} />);
      const refused = view.querySelector("[data-slot='docs-page-view']")!;
      expect(refused.getAttribute("data-refused")).toBe("true");
      expect(refused.textContent).toBe("Can't show this page");
      expect(view.querySelector("a")).toBeNull();
      await act(async () => root!.unmount());
      root = undefined;
      container!.remove();
    }
  });

  test("docsPageTarget parses an http(s) page and refuses the rest", () => {
    expect(docsPageTarget("https://vibelang.sh/a.md")).toEqual({
      href: "https://vibelang.sh/a.md",
      origin: "https://vibelang.sh",
      host: "vibelang.sh",
    });
    expect(docsPageTarget("http://localhost:3000/a.md")?.origin).toBe("http://localhost:3000");
    expect(docsPageTarget("file:///etc/passwd")).toBeNull();
  });

  test("its sheet is part of the package's stylesheet", () => {
    expect(smithersUiCss).toContain(docsPageCss);
  });
});

describe("DocsPageView: one title", () => {
  /** Every level-1 heading's text, by role: the title's `h1` and the page's own `# ` heading alike. */
  const topHeadings = (el: HTMLElement) =>
    [...el.querySelectorAll('h1, [role="heading"][aria-level="1"]')].map((heading) => heading.textContent);

  test("a page whose Markdown opens with its own # heading draws that heading alone, never the title twice", async () => {
    const el = await render(
      <DocsPageView title="Retrying" url={URL_} text={"# Retrying\n\nRetry a failing effect."} size="full" headingLevel={1} />,
    );
    expect(topHeadings(el)).toEqual(["Retrying"]);
    expect(el.textContent).toContain("Retry a failing effect.");
  });

  test("a page without one, or one opening with a lower heading, gets the title as its heading", async () => {
    const el = await render(<DocsPageView title="Retrying" url={URL_} text={"## Schedules\n\nText."} headingLevel={1} />);
    expect(topHeadings(el)).toEqual(["Retrying"]);
  });
});
