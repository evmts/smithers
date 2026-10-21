/** @jsxImportSource react */
// RepositoryHome under happy-dom: real createRoot + act. Clicks reach a host
// listener on the document that prevents them, so no link navigates the shared window.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Home } from "@smthrs/views";
import { RepositoryHome, smithersUiCss } from "../src";
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
const $$ = <E extends Element = HTMLElement>(selector: string) => [...container!.querySelectorAll<E>(selector)];
const block = (kind: string) => $(`[data-slot='repository-home-block'][data-kind='${kind}']`);

const ASK = "https://smithers.test/maya/tinyhttp?ask=1";

/** Clicks `link`; reports whether it was already default-prevented when it reached the host, which then prevents it. */
async function click(link: HTMLElement, init: MouseEventInit = {}): Promise<boolean> {
  let prevented: boolean | undefined;
  const host = (event: Event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", host);
  try {
    await act(async () => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
    });
  } finally {
    document.removeEventListener("click", host);
  }
  if (prevented === undefined) throw new Error("the click never reached the document");
  return prevented;
}

describe("RepositoryHome: text", () => {
  test("a titled text block is an h2 over its text in a paragraph", async () => {
    await render(<RepositoryHome blocks={[{ type: "text", title: "About", text: "A tiny HTTP server.\nNo deps." }]} />);
    const text = block("text")!;
    expect(text.querySelector("h2")!.textContent).toBe("About");
    expect(text.querySelector("p")!.textContent).toBe("A tiny HTTP server.\nNo deps.");
  });

  test("the title is optional", async () => {
    await render(<RepositoryHome blocks={[{ type: "text", text: "Hello." }]} />);
    expect(block("text")!.querySelector("h2")).toBeNull();
    expect(block("text")!.querySelector("p")!.textContent).toBe("Hello.");
  });

  test("text that looks like markup is shown as text, never as elements", async () => {
    const text = '<img src=x onerror="alert(1)"><b>bold</b>';
    await render(<RepositoryHome blocks={[{ type: "text", title: "<i>t</i>", text }]} />);
    expect(block("text")!.querySelector("p")!.textContent).toBe(text);
    expect(block("text")!.querySelector("h2")!.textContent).toBe("<i>t</i>");
    expect($("img")).toBeNull();
    expect($("b")).toBeNull();
    expect($("i")).toBeNull();
  });

  test("its sheet keeps line breaks and is part of smithersUiCss", () => {
    expect(smithersUiCss).toMatch(/\.sui-repository-home-text \{[^}]*white-space:pre-wrap/);
    expect(smithersUiCss).toContain(".sui-repository-home-apps");
  });
});

describe("RepositoryHome: links", () => {
  test("each link opens its URL in a new tab with no opener or referrer, labelled as text", async () => {
    await render(
      <RepositoryHome
        blocks={[
          {
            type: "links",
            title: "Docs",
            links: [
              { label: "Install", url: "https://smithers.sh/" },
              { label: "<b>Report</b>", url: "http://example.com/bug?x=1" },
            ],
          },
        ]}
      />,
    );
    const links = block("links")!;
    expect(links.querySelector("h2")!.textContent).toBe("Docs");
    const anchors = [...links.querySelectorAll<HTMLAnchorElement>("ul > li > a")];
    expect(anchors.map((a) => [a.textContent, a.getAttribute("href"), a.target, a.rel])).toEqual([
      ["Install", "https://smithers.sh/", "_blank", "noopener noreferrer"],
      ["<b>Report</b>", "http://example.com/bug?x=1", "_blank", "noopener noreferrer"],
    ]);
    expect($("b")).toBeNull();
  });

  test("a link that isn't absolute http or https is not drawn, and a block with none left draws nothing", async () => {
    await render(
      <RepositoryHome
        blocks={[
          {
            type: "links",
            links: [
              { label: "Script", url: "javascript:alert(1)" },
              { label: "Relative", url: "/settings" },
              { label: "Tab", url: "https://exa\tmple.com/" },
              { label: "Kept", url: "HTTPS://example.com/" },
            ],
          },
        ]}
      />,
    );
    expect($$<HTMLAnchorElement>("a").map((a) => a.textContent)).toEqual(["Kept"]);

    await render(<RepositoryHome blocks={[{ type: "links", links: [{ label: "Script", url: "javascript:alert(1)" }] }]} />);
    expect(container!.innerHTML).toBe("");
  });
});

describe("RepositoryHome: markdown", () => {
  const readme = { type: "markdown", path: "docs/README.md", title: "Read me" } as const;

  test("a path absent from files is loading, with an accessible name", async () => {
    await render(<RepositoryHome blocks={[readme]} />);
    const spinner = block("markdown")!.querySelector("[role='status']")!;
    expect(spinner.getAttribute("aria-label")).toBe("Loading docs/README.md");
    expect(block("markdown")!.querySelector("h2")!.textContent).toBe("Read me");
    expect(block("markdown")!.querySelector("[data-slot='markdown']")).toBeNull();
  });

  test("an explicit loading file is loading too", async () => {
    await render(<RepositoryHome blocks={[readme]} files={{ "docs/README.md": { state: "loading" } }} />);
    expect(block("markdown")!.querySelector("[role='status']")!.getAttribute("aria-label")).toBe("Loading docs/README.md");
  });

  test("a path an object inherits is not a file the host holds", async () => {
    await render(<RepositoryHome blocks={[{ type: "markdown", path: "constructor" }]} files={{}} />);
    expect(block("markdown")!.querySelector("[role='status']")!.getAttribute("aria-label")).toBe("Loading constructor");
  });

  test("read text renders as a document", async () => {
    await render(
      <RepositoryHome blocks={[readme]} files={{ "docs/README.md": { state: "text", text: "# tinyhttp\n\nSmall and **fast**." } }} />,
    );
    const markdown = block("markdown")!.querySelector("[data-slot='markdown']")!;
    expect(markdown.querySelector(".sui-md-h1")!.textContent).toBe("tinyhttp");
    expect(markdown.querySelector("strong")!.textContent).toBe("fast");
    expect(block("markdown")!.querySelector("[role='status']")).toBeNull();
  });

  test("a failed read is one status line naming the path", async () => {
    await render(<RepositoryHome blocks={[readme]} files={{ "docs/README.md": { state: "failed" } }} />);
    const status = block("markdown")!.querySelector("[role='status']")!;
    expect(status.tagName).toBe("P");
    expect(status.textContent).toBe("Couldn't read docs/README.md");
    expect(block("markdown")!.querySelector("[data-slot='markdown']")).toBeNull();
  });
});

describe("RepositoryHome: prompt", () => {
  test("a link-button to askHref, labelled by its placeholder, under its title", async () => {
    await render(
      <RepositoryHome askHref={ASK} blocks={[{ type: "prompt", title: "What should we work on?", placeholder: "Ask about tinyhttp" }]} />,
    );
    const prompt = block("prompt")!;
    expect(prompt.querySelector("h2")!.textContent).toBe("What should we work on?");
    const link = prompt.querySelector<HTMLAnchorElement>("a")!;
    expect(link.getAttribute("href")).toBe(ASK);
    expect(link.textContent).toBe("Ask about tinyhttp");
    expect(link.dataset.slot).toBe("button");
    expect(link.classList.contains("sui-button-outline")).toBe(true);
    expect(prompt.querySelector("button")).toBeNull();
  });

  test("without a placeholder it reads Ask Smithers", async () => {
    await render(<RepositoryHome askHref={ASK} blocks={[{ type: "prompt" }]} />);
    expect(block("prompt")!.querySelector("a")!.textContent).toBe("Ask Smithers");
    expect(block("prompt")!.querySelector("h2")).toBeNull();
  });

  test("with onAsk, a plain click is the host's: default prevented, onAsk gets the flow or undefined", async () => {
    const asked: Array<string | undefined> = [];
    await render(
      <RepositoryHome
        askHref={ASK}
        onAsk={(flow) => asked.push(flow)}
        blocks={[{ type: "prompt", flow: "wiki.ask", placeholder: "Ask the wiki" }, { type: "prompt" }]}
      />,
    );
    const [withFlow, withoutFlow] = $$<HTMLAnchorElement>("[data-kind='prompt'] a");
    expect(await click(withFlow!)).toBe(true);
    expect(await click(withoutFlow!)).toBe(true);
    expect(asked).toEqual(["wiki.ask", undefined]);
    expect(withFlow!.getAttribute("href")).toBe(ASK);
  });

  test("a modified or non-primary click keeps the browser's behavior and doesn't call onAsk", async () => {
    const asked: Array<string | undefined> = [];
    await render(<RepositoryHome askHref={ASK} onAsk={(flow) => asked.push(flow)} blocks={[{ type: "prompt", flow: "wiki.ask" }]} />);
    const link = block("prompt")!.querySelector<HTMLAnchorElement>("a")!;
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect([init, await click(link, init)]).toEqual([init, false]);
    }
    expect(asked).toEqual([]);
  });

  test("without onAsk the button is a plain link: a click keeps its default", async () => {
    await render(<RepositoryHome askHref={ASK} blocks={[{ type: "prompt" }]} />);
    expect(await click(block("prompt")!.querySelector("a")!)).toBe(false);
  });

  test("not drawn without askHref", async () => {
    await render(<RepositoryHome blocks={[{ type: "prompt", title: "Ask" }, { type: "text", text: "Hi." }]} />);
    expect(block("prompt")).toBeNull();
    expect(block("text")).not.toBeNull();
  });
});

describe("RepositoryHome: app", () => {
  const fix = { type: "app", flow: "issue.implement", title: "Fix an issue", picture: "issue" } as const;
  const review = { type: "app", flow: "prs.triage", title: "Review a PR", picture: "review" } as const;
  const wiki = { type: "app", flow: "wiki.ask", title: "Ask the codebase", picture: "wiki" } as const;
  const all = () => true;

  test("an offered app is a link-button to askHref labelled by its title, wearing its picture", async () => {
    await render(<RepositoryHome askHref={ASK} offered={all} blocks={[fix]} />);
    const app = block("app")!;
    const link = app.querySelector<HTMLAnchorElement>("a")!;
    expect(link.getAttribute("href")).toBe(ASK);
    expect(link.textContent).toBe("Fix an issue");
    expect(link.dataset.picture).toBe("issue");
    expect(link.classList.contains("sui-button-outline")).toBe(true);
    expect(app.querySelector("h2")).toBeNull();
  });

  test("with onAsk, a plain click prevents the default and tells onAsk its flow; a modified click doesn't", async () => {
    const asked: Array<string | undefined> = [];
    await render(<RepositoryHome askHref={ASK} offered={all} onAsk={(flow) => asked.push(flow)} blocks={[fix]} />);
    const link = block("app")!.querySelector<HTMLAnchorElement>("a")!;
    expect(await click(link, { metaKey: true })).toBe(false);
    expect(asked).toEqual([]);
    expect(await click(link)).toBe(true);
    expect(asked).toEqual(["issue.implement"]);
    expect(link.getAttribute("href")).toBe(ASK);
  });

  test("without onAsk an app button is a plain link", async () => {
    await render(<RepositoryHome askHref={ASK} offered={all} blocks={[fix]} />);
    expect(await click(block("app")!.querySelector("a")!)).toBe(false);
  });

  test("hidden when the page hasn't its flow, and with no offered at all", async () => {
    const seen: Array<string> = [];
    await render(
      <RepositoryHome
        askHref={ASK}
        offered={(flow) => (seen.push(flow), flow === "prs.triage")}
        blocks={[fix, review]}
      />,
    );
    expect($$("[data-kind='app'] a").map((a) => a.textContent)).toEqual(["Review a PR"]);
    expect(seen).toEqual(["issue.implement", "prs.triage"]);

    await render(<RepositoryHome askHref={ASK} blocks={[fix, { type: "text", text: "Hi." }]} />);
    expect(block("app")).toBeNull();
    expect(block("text")).not.toBeNull();
  });

  test("hidden without askHref even when offered", async () => {
    await render(<RepositoryHome offered={all} blocks={[fix]} />);
    expect(container!.innerHTML).toBe("");
  });

  test("adjacent apps share one wrapping row; other drawn blocks split rows", async () => {
    await render(
      <RepositoryHome
        askHref={ASK}
        offered={(flow) => flow !== "hidden"}
        blocks={[
          fix,
          { type: "app", flow: "hidden", title: "Hidden", picture: "wiki" },
          review,
          { type: "flows" },
          wiki,
          { type: "text", text: "Between." },
          fix,
        ]}
      />,
    );
    const section = $("[data-slot='repository-home']")!;
    const rows = [...section.children].map((child) =>
      child.getAttribute("data-slot") === "repository-home-apps"
        ? [...child.querySelectorAll("a")].map((a) => a.textContent)
        : child.getAttribute("data-kind"),
    );
    expect(rows).toEqual([["Fix an issue", "Review a PR", "Ask the codebase"], "text", ["Fix an issue"]]);
  });
});

describe("RepositoryHome: blocks with no source yet", () => {
  test("flows, stack and view draw nothing beside drawn blocks", async () => {
    await render(
      <RepositoryHome
        askHref={ASK}
        offered={() => true}
        blocks={[{ type: "flows", title: "Flows" }, { type: "text", text: "Hi." }, { type: "stack", title: "Stack" }, { type: "view", flow: "home" }]}
      />,
    );
    expect($$("[data-slot='repository-home-block']").map((el) => el.dataset.kind)).toEqual(["text"]);
    expect($("h2")).toBeNull();
  });

  test("a home where no block draws renders nothing", async () => {
    await render(
      <RepositoryHome
        blocks={[
          { type: "flows" },
          { type: "stack" },
          { type: "view", flow: "home" },
          { type: "prompt" },
          { type: "app", flow: "wiki.ask", title: "Ask", picture: "wiki" },
        ]}
      />,
    );
    expect(container!.innerHTML).toBe("");
    await render(<RepositoryHome blocks={[]} />);
    expect(container!.innerHTML).toBe("");
  });
});

describe("RepositoryHome: the section", () => {
  test("passes extra props to the section and merges its class", async () => {
    await render(
      <RepositoryHome
        id="home"
        aria-label="maya/tinyhttp home"
        data-testid="home"
        className="extra"
        blocks={[{ type: "text", text: "Hi." }]}
      />,
    );
    const section = $("section")!;
    expect(section.dataset.slot).toBe("repository-home");
    expect(section.id).toBe("home");
    expect(section.getAttribute("aria-label")).toBe("maya/tinyhttp home");
    expect(section.dataset.testid).toBe("home");
    expect([...section.classList]).toEqual(["sui-repository-home", "extra"]);
  });

  test("draws this repository's own .smithers/home.json as Home.read answers it", async () => {
    const text = readFileSync(join(import.meta.dir, "../../../../.smithers/home.json"), "utf8");
    const home = Home.read(text);
    if (home._tag !== "Declared") throw new Error(`home.json is ${home.reason}`);
    const markdown = home.blocks.flatMap((b) => (b.type === "markdown" ? [b.path] : []));
    await render(
      <RepositoryHome
        askHref={ASK}
        offered={() => true}
        blocks={home.blocks}
        files={Object.fromEntries(markdown.map((path) => [path, { state: "text", text: "# Fixed" }]))}
      />,
    );
    const kinds = $$("[data-slot='repository-home-block']").map((el) => el.dataset.kind);
    const undrawn = new Set(["flows", "stack", "view"]);
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds).toEqual(home.blocks.filter((b) => !undrawn.has(b.type)).map((b) => b.type));
  });
});
