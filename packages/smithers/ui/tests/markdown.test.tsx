import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, SMITHERS_UI_STYLE_ATTR } from "../src/index";
import { markdownBlockParser } from "../src/primitives/markdown";

/**
 * The mixed-block structure and HTML-escaping cases render with
 * `renderToStaticMarkup` (no DOM), the components.test.tsx convention. The
 * link-activation cases need real event dispatch, so they mount through
 * `createRoot` + `act` under the happy-dom preload, like radix-interaction.
 */

const SAMPLE = [
  "# Title",
  "",
  "Some **bold**, *italic*, `code`, and a [link](https://smithers.sh).",
  "",
  "- one",
  "- two",
  "",
  "1. first",
  "2. second",
  "",
  "```",
  "const x = 1;",
  "```",
].join("\n");

describe("Markdown (static markup)", () => {
  test("is a memoized component (re-renders only on prop change)", () => {
    expect((Markdown as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for("react.memo"));
  });

  test("renders headings, lists, code fence, inline styles, and links", () => {
    const html = renderToStaticMarkup(<Markdown content={SAMPLE} />);
    expect(html).toContain('data-slot="markdown"');
    expect(html).toContain("sui-md");
    // heading
    expect(html).toContain("sui-md-h1");
    expect(html).toContain("Title");
    // inline
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("sui-md-inline-code");
    expect(html).toContain(">code<");
    // link
    expect(html).toContain("sui-md-link");
    expect(html).toContain('href="https://smithers.sh"');
    // lists
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html).toContain("sui-md-list");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>first</li>");
    // fenced code
    expect(html).toContain("sui-codeblock");
    expect(html).toContain("const x = 1;");
  });

  test("escapes raw HTML in the source (no markup injection)", () => {
    const html = renderToStaticMarkup(
      <Markdown content={'Hello <img src=x onerror="alert(1)"> and <script>alert(2)</script>'} />,
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
  });

  test("drops non-navigable link schemes (javascript:)", () => {
    const html = renderToStaticMarkup(<Markdown content="[click](javascript:alert(1))" />);
    expect(html).not.toContain("javascript:");
    // label still renders as an anchor, just without a dangerous href.
    expect(html).toContain("sui-md-link");
    expect(html).toContain("click");
  });

  test("keeps a consumer className and data-slot", () => {
    const html = renderToStaticMarkup(<Markdown content="hi" className="mine" />);
    expect(html).toContain("mine");
    expect(html).toContain("sui-md");
    expect(html).toContain('data-slot="markdown"');
  });

  test("matches the uncached renderer across markdown block shapes", () => {
    const inputs = [
      "",
      "plain text",
      "first line\nsecond line",
      "first paragraph\n\nsecond paragraph",
      "# Heading\nparagraph\n## Next",
      "- one\n- two\nparagraph",
      "1. one\n2. two\n\n- three",
      "```\nconst x = 1;",
      "```ts\nconst x = 1;\n```\nAfter",
      "same\n\nsame\n\nlast",
      "Raw <tag> and **bold**, *italic*, `code`, and [link](/docs).",
      "| repo | issues |\n| --- | ---: |\n| smithers | 3 |",
      "Before\n\n| a | b |\n|:-:|---|\n| 1 | 2 |\n\nAfter",
      // A header row that also looks like a bullet: the delimiter row decides.
      "- a | b\n--- | ---\n- c | d",
      SAMPLE,
    ];

    for (const content of inputs) {
      const cached = renderToStaticMarkup(<Markdown content={content} />);
      const uncached = renderToStaticMarkup(
        <div data-slot="markdown" className="sui-md">
          {markdownBlockParser.render(content)}
        </div>,
      );
      expect(cached).toBe(uncached);
    }
  });
});

describe("Markdown (link activation)", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  let container: HTMLElement | undefined;
  let root: Root | undefined;

  afterEach(async () => {
    if (root) {
      const r = root;
      await act(async () => r.unmount());
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
    const r = root;
    await act(async () => r.render(element));
  }

  test("onLinkClick fires with the href and default navigation is prevented", async () => {
    const seen: string[] = [];
    await render(
      <Markdown content="Read the [docs](https://smithers.sh/docs) now." onLinkClick={(href) => seen.push(href)} />,
    );
    const anchor = container!.querySelector("a.sui-md-link") as HTMLAnchorElement;
    expect(anchor).toBeTruthy();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => {
      anchor.dispatchEvent(event);
    });
    expect(seen).toEqual(["https://smithers.sh/docs"]);
    expect(event.defaultPrevented).toBe(true);
  });

  test("rejects unsafe links without invoking onLinkClick", async () => {
    const seen: string[] = [];
    await render(<Markdown content="Click [this](javascript:alert)" onLinkClick={(href) => seen.push(href)} />);
    const anchor = container!.querySelector("a.sui-md-link") as HTMLAnchorElement;
    expect(anchor).toBeTruthy();
    expect(anchor.hasAttribute("href")).toBe(false);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => {
      anchor.dispatchEvent(event);
    });
    expect(seen).toEqual([]);
    expect(event.defaultPrevented).toBe(true);
  });

  test("without onLinkClick the anchor keeps its href and default is not prevented", async () => {
    await render(<Markdown content="[docs](https://smithers.sh/docs)" />);
    const anchor = container!.querySelector("a.sui-md-link") as HTMLAnchorElement;
    expect(anchor.getAttribute("href")).toBe("https://smithers.sh/docs");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    await act(async () => {
      anchor.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  test("replacing the content keeps the completed-block cache the size of the document", async () => {
    // The cache is private to the instance, so the test captures it the only way
    // a caller can: the Map that block sources are written into.
    const caches = new Set<Map<unknown, unknown>>();
    const originalSet = Map.prototype.set;
    Map.prototype.set = function set(this: Map<unknown, unknown>, key: unknown, value: unknown) {
      if (typeof key === "string" && key.startsWith("cache-probe:")) caches.add(this);
      return originalSet.call(this, key, value);
    };
    try {
      await render(<Markdown content={"cache-probe:0\n\ntail"} />);
      for (let version = 1; version < 200; version += 1) {
        await act(async () => root!.render(<Markdown content={`cache-probe:${version}\n\ntail`} />));
      }
    } finally {
      Map.prototype.set = originalSet;
    }

    expect(caches.size).toBe(1);
    // One completed block is on screen ("cache-probe:199"); the trailing block
    // is never cached. Retaining every replaced version would be 200 entries.
    expect([...caches][0]!.size).toBe(1);
    expect(container!.textContent).toContain("cache-probe:199");
  });

  test("appending streamed content does not re-parse completed blocks", async () => {
    const parse = spyOn(markdownBlockParser, "render");
    try {
      await render(<Markdown content={"First.\n\nSecond"} />);
      expect(parse.mock.calls.filter(([source]) => source === "First.")).toHaveLength(1);

      await act(async () => root!.render(<Markdown content={"First.\n\nSecond grows"} />));
      await act(async () => root!.render(<Markdown content={"First.\n\nSecond grows\n\nThird"} />));
      const completedSecondParses = parse.mock.calls.filter(([source]) => source === "Second grows").length;
      await act(async () => root!.render(<Markdown content={"First.\n\nSecond grows\n\nThird grows"} />));

      expect(parse.mock.calls.filter(([source]) => source === "First.")).toHaveLength(1);
      expect(parse.mock.calls.filter(([source]) => source === "Second grows")).toHaveLength(completedSecondParses);
      expect(parse.mock.calls.filter(([source]) => source === "Third grows")).toHaveLength(1);
    } finally {
      parse.mockRestore();
    }
  });
});

/*
 * Document mode reads a repository file the way GitHub renders it. The
 * fixture is the head of the smithers-canary README as smithers.sh serves it
 * (generated by apps/site/scripts/generate-project-copy.mjs): a comment, a
 * centered `<pre>` banner, a centered `<p><strong>` tagline, and a paragraph
 * whose sentences sit on separate source lines.
 */
const BANNER = [
  "███████╗███╗   ███╗██╗████████╗██╗  ██╗",
  "██╔════╝████╗ ████║██║╚══██╔══╝██║  ██║",
  "╚══════╝╚═╝     ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝",
];
const README = [
  "<!-- Generated from apps/site/src/data/project.json by apps/site/scripts/generate-project-copy.mjs. -->",
  "",
  '<pre align="center">',
  ...BANNER,
  "</pre>",
  "",
  '<p align="center"><strong>Automate maintaining your codebase</strong></p>',
  "",
  "## Open Smithers",
  "",
  "Open [the Smithers repository](https://smithers.sh/smithersai/smithers) in your browser.",
  "Explore its files, ask questions in chat, and inspect runs and changes in the conversation.",
].join("\n");

/** Static markup, parsed back into a detached element for structural queries. */
const documentDom = (content: string, variant: "chat" | "document" = "document"): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<Markdown content={content} variant={variant} />);
  return host;
};

describe("Markdown (document mode)", () => {
  test("renders the canary README with no markup text: comment dropped, banner preformatted, tagline bold", () => {
    const dom = documentDom(README);
    const text = dom.textContent ?? "";
    expect(text).not.toContain("<");
    expect(text).not.toContain("Generated from");
    expect(text).not.toContain("align=");

    const pre = dom.querySelectorAll("pre");
    expect(pre).toHaveLength(1);
    expect(pre[0]!.className).toBe("sui-md-pre");
    expect(pre[0]!.getAttribute("data-align")).toBe("center");
    // Every space of the banner survives, one row per source line.
    expect(pre[0]!.textContent).toBe(BANNER.join("\n"));

    const tagline = dom.querySelector("p.sui-md-p > strong");
    expect(tagline?.textContent).toBe("Automate maintaining your codebase");
    expect((tagline!.parentElement as HTMLElement).style.textAlign).toBe("center");
    expect(dom.querySelector(".sui-md-h2")?.textContent).toBe("Open Smithers");
  });

  test("joins a paragraph's single newlines into spaces, as GitHub does", () => {
    const dom = documentDom(README);
    const paragraph = [...dom.querySelectorAll("p.sui-md-p")].at(-1)!;
    expect(paragraph.textContent).toBe(
      "Open the Smithers repository in your browser. Explore its files, ask questions in chat, and inspect runs and changes in the conversation.",
    );
    expect(paragraph.querySelector("br")).toBeNull();
    expect(paragraph.querySelector("a.sui-md-link")?.getAttribute("href")).toBe("https://smithers.sh/smithersai/smithers");
    // A trailing two spaces (or a backslash) is still a hard break.
    expect(documentDom("one  \ntwo\\\nthree\nfour").querySelectorAll("p br")).toHaveLength(2);
  });

  test("keeps bold, italic, code, breaks and safe links from HTML, and only their text otherwise", () => {
    const dom = documentDom(
      [
        '<div align="center"><h1>Smithers</h1>',
        '<a href="https://smithers.sh/docs"><img src="badge.svg" alt="Docs"></a> <b>bold</b> <i>it</i> <code>x &lt; y</code><br><span title="t">plain</span> <img src="x.png">',
        "</div>",
        "",
        "Inline <em>html</em> in **Markdown**, a `<br>` code span, and <https://smithers.sh/bug>.",
      ].join("\n"),
    );
    expect(dom.querySelector(".sui-md-h1")?.textContent).toBe("Smithers");
    expect((dom.querySelector(".sui-md-h1") as HTMLElement).style.textAlign).toBe("center");
    const link = dom.querySelector('a.sui-md-link[href="https://smithers.sh/docs"]');
    expect(link?.textContent).toBe("Docs");
    expect(dom.querySelector("strong")?.textContent).toBe("bold");
    expect(dom.querySelector("em")?.textContent).toBe("it");
    expect(dom.querySelector("code.sui-md-inline-code")?.textContent).toBe("x < y");
    expect(dom.querySelectorAll("p br")).toHaveLength(1);
    expect(dom.querySelector("span, img, div[align]")).toBeNull();
    expect(dom.textContent).toContain("plain");
    const inline = [...dom.querySelectorAll("p.sui-md-p")].at(-1)!;
    expect(inline.querySelector("em")?.textContent).toBe("html");
    expect(inline.querySelector("strong")?.textContent).toBe("Markdown");
    expect(inline.querySelector("code")?.textContent).toBe("<br>");
    expect(inline.querySelector('a[href="https://smithers.sh/bug"]')?.textContent).toBe("https://smithers.sh/bug");
  });

  test("a script, an event attribute or an unsafe URL renders as text only, never as an element or attribute", () => {
    const source = [
      "<script>alert(1)</script>",
      "",
      '<div onclick="alert(2)">Hi <b onmouseover="steal()">there</b> <a href="javascript:alert(3)">bad link</a> <img src=x onerror="alert(4)" alt="logo"></div>',
      "",
      'Inline <a href="javascript:alert(5)" onclick="alert(6)">also bad</a> and <script>alert(7)</script>.',
    ].join("\n");
    const html = renderToStaticMarkup(<Markdown content={source} variant="document" />);
    for (const forbidden of ["<script", "onclick", "onmouseover", "onerror", "javascript:", "<img", "<div onclick", "steal"]) {
      expect(html).not.toContain(forbidden);
    }
    const dom = documentDom(source);
    expect(dom.querySelectorAll("a")).toHaveLength(0);
    expect(dom.querySelector("strong")?.textContent).toBe("there");
    expect(dom.querySelector("strong")!.attributes).toHaveLength(0);
    for (const text of ["alert(1)", "Hi there bad link logo", "Inline also bad and alert(7)."]) {
      expect(dom.textContent).toContain(text);
    }
  });

  test("decodes HTML entities in prose, not in code", () => {
    const dom = documentDom("<p>Tom &amp; Jerry &copy; &#x1F600; &unknown;</p>\n\nA &lt;tag&gt; and `&amp;`");
    expect(dom.querySelector("p")?.textContent).toBe("Tom & Jerry © 😀 &unknown;");
    expect([...dom.querySelectorAll("p")].at(-1)?.textContent).toBe("A <tag> and &amp;");
  });

  test("chat mode is unchanged: HTML stays text and each line keeps its break", () => {
    const chat = renderToStaticMarkup(<Markdown content={README} />);
    expect(renderToStaticMarkup(<Markdown content={README} variant="chat" />)).toBe(chat);
    expect(chat).toBe(
      renderToStaticMarkup(
        <div data-slot="markdown" className="sui-md">
          {markdownBlockParser.render(README)}
        </div>,
      ),
    );
    expect(chat).toContain("&lt;!-- Generated from");
    expect(chat).toContain("&lt;pre align=&quot;center&quot;&gt;");
    expect(chat).not.toContain("sui-md-pre");
    const dom = documentDom(README, "chat");
    expect([...dom.querySelectorAll("p.sui-md-p")].at(-1)!.querySelectorAll("br")).toHaveLength(1);
  });

  test("matches the uncached document renderer across block shapes", () => {
    const inputs = [
      README,
      "<!-- one\ntwo -->\nafter",
      "<pre>\n  a  b\n</pre>\ntrailing",
      "<pre>unterminated\n  x",
      "para\n<div>block</div>\nmore",
      "para\n<span>inline</span>\nmore",
      "- <b>one</b>\n- two\n\n| <i>a</i> | b |\n| --- | --- |\n| 1 | 2 |",
      "```html\n<p>kept verbatim</p>\n```",
    ];
    for (const content of inputs) {
      const cached = renderToStaticMarkup(<Markdown content={content} variant="document" />);
      const uncached = renderToStaticMarkup(
        <div data-slot="markdown" className="sui-md">
          {markdownBlockParser.render(content, undefined, "document")}
        </div>,
      );
      expect(cached).toBe(uncached);
    }
    // A fence keeps HTML as code, in either mode.
    expect(documentDom("```html\n<p>kept verbatim</p>\n```").textContent).toContain("<p>kept verbatim</p>");
  });
});
