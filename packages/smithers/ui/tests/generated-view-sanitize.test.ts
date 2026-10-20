import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { sanitize } from "../src/generated-view/sanitize";

const parser = new DOMParser();

/** Sanitizes into a fresh container and returns its HTML. */
const clean = (html: string): string => {
  const container = document.createElement("div");
  container.appendChild(sanitize(html, document, parser));
  return container.innerHTML;
};

describe("sanitize keeps", () => {
  test("text, layout, tables and form controls with their attributes", () => {
    const html =
      '<section class="sui-card" data-slot="card" role="region" aria-label="Board"><h2>Title</h2>' +
      '<table><thead><tr><th scope="col">A</th></tr></thead><tbody><tr><td colspan="2">1</td></tr></tbody></table>' +
      '<form data-event="ask"><label for="u">URL</label><input id="u" name="url" type="url" placeholder="https://" required>' +
      '<select name="s"><option value="1" selected>One</option></select><textarea name="t" rows="2"></textarea>' +
      '<button type="submit" data-event="ask:1" disabled>Go</button></form></section>';
    expect(clean(html)).toBe(html.replace(/ (required|selected|disabled)(?=[ >])/g, ' $1=""'));
  });

  test("SVG shapes with presentation attributes and local references", () => {
    const html =
      '<svg viewBox="0 0 10 10" width="10"><defs><linearGradient id="g"><stop offset="0" stop-color="red"></stop></linearGradient></defs>' +
      '<circle cx="5" cy="5" r="4" fill="url(#g)" stroke-width="1"></circle><path d="M0 0L10 10"></path></svg>';
    expect(clean(html)).toBe(html);
  });

  test("a data:image source on an image, and text that only looks like markup", () => {
    expect(clean('<img alt="dot" src="data:image/png;base64,AA">')).toBe('<img alt="dot" src="data:image/png;base64,AA">');
    expect(clean("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("sanitize drops", () => {
  test("elements that run, load, navigate or reparse, with everything inside them", () => {
    const refused = [
      "<script>alert(1)</script>",
      '<iframe src="https://evil.example"></iframe>',
      '<object data="x"></object>',
      '<embed src="x">',
      '<link rel="stylesheet" href="https://evil.example/x.css">',
      '<meta http-equiv="refresh" content="0;url=https://evil.example">',
      '<base href="https://evil.example/">',
      '<a href="https://evil.example">link <b>bold</b></a>',
      "<style>@import url(https://evil.example/x.css)</style>",
      "<template><img src=x onerror=alert(1)></template>",
      "<noscript><p>x</p></noscript>",
      "<math><mi>x</mi></math>",
      '<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>',
      '<svg><use href="#x"></use><image href="https://evil.example/p.png"></image><animate attributeName="href"></animate></svg>',
      '<video src="https://evil.example/v.mp4"></video>',
      "<!-- a comment -->",
    ];
    for (const html of refused) expect(clean(html).replace(/<\/?svg>/g, "")).toBe("");
  });

  test("removes hidden inputs rather than submitting invisible text", () => {
    expect(clean('<input type="HIDDEN" name="secret" value="no"><input name="visible" value="yes">')).toBe(
      '<input name="visible" value="yes">',
    );
  });

  test("handlers, links, remote sources and URL-bearing styles", () => {
    expect(clean('<p onclick="alert(1)" OnMouseOver="x" title="t">x</p>')).toBe('<p title="t">x</p>');
    expect(clean('<img src="https://evil.example/p.png" srcset="a.png 1x" alt="x">')).toBe('<img alt="x">');
    expect(clean('<div src="data:image/png;base64,AA" action="/x" formaction="/y" href="/z"></div>')).toBe("<div></div>");
    expect(clean('<form name="body" action="/x"><img name="cookie" alt="a"><input name="q"></form>')).toBe(
      '<form><img alt="a"><input name="q"></form>',
    );
    expect(clean('<input type="image" src="https://evil.example/p.png"><input type="file"><input type="TEXT">')).toBe(
      '<input><input><input type="TEXT">',
    );
    for (const style of [
      "background:url(https://evil.example/p.png)",
      "background:URL( 'x' )",
      "background:image-set('x.png' 1x)",
      "width:expression(alert(1))",
      "@import 'x'",
      "background:\\75 rl(x)",
    ]) {
      expect(clean(`<div style="${style}" class="k"></div>`)).toBe('<div class="k"></div>');
    }
    expect(clean('<div style="color: red; margin: 2px"></div>')).toBe('<div style="color: red; margin: 2px"></div>');
    expect(clean('<svg><rect fill="url(https://evil.example/p.svg#a)" stroke="red"></rect></svg>')).toBe(
      '<svg><rect stroke="red"></rect></svg>',
    );
    expect(clean('<svg><rect xlink:href="#a" xmlns:xlink="http://www.w3.org/1999/xlink"></rect></svg>')).toBe(
      "<svg><rect></rect></svg>",
    );
  });
});

/** Hostile markup, built from the pieces mXSS and filter bypasses are made of. */
const hostileHtml: fc.Arbitrary<string> = fc.letrec<{ node: string }>((tie) => ({
  node: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    fc.constantFrom("x", "&lt;", "<!--", "-->", "]]>", "<![CDATA[", "\"", "'", "`", "</p>", "</svg>", "</math>", "</style>", "</script>"),
    fc.tuple(
      fc.mixedCase(fc.constantFrom(
        "p", "div", "svg", "math", "style", "script", "a", "img", "iframe", "noscript", "template", "form", "input",
        "button", "table", "td", "select", "option", "textarea", "title", "xmp", "plaintext", "foreignObject",
        "annotation-xml", "mglyph", "desc", "image", "use", "animate", "set", "object", "base", "meta", "link",
      )),
      fc.array(
        fc.tuple(
          fc.mixedCase(fc.constantFrom(
            "onerror", "onload", "onclick", "href", "src", "xlink:href", "srcdoc", "action", "formaction", "style",
            "class", "id", "name", "type", "data-event", "aria-label", "fill", "srcset", "attributeName", "values",
            "encoding", "http-equiv", "content",
          )),
          fc.constantFrom(
            "x", "javascript:alert(1)", "https://evil.example/p", "url(https://evil.example)", "image", "text/html",
            "data:image/png;base64,AA", "data:text/html,<script>alert(1)</script>", "\"><img src=x onerror=alert(1)>",
            "refresh", "body", "cookie",
          ),
        ),
        { maxLength: 3 },
      ),
      fc.array(tie("node"), { maxLength: 3 }),
    ).map(([tag, attributes, children]) =>
      `<${tag}${attributes.map(([name, value]) => ` ${name}="${value}"`).join("")}>${children.join("")}</${tag}>`
    ),
  ),
})).node;

const allowedAttribute = (element: Element, name: string, value: string): boolean => {
  if (name.startsWith("on")) return false;
  if (["href", "xlink:href", "srcset", "srcdoc", "action", "formaction"].includes(name)) return false;
  if (name === "src") return element.localName === "img" && value.startsWith("data:image/");
  return true;
};

describe("sanitize, fuzzed", () => {
  // The frame builds nodes and never serializes them, so a parse of the output
  // that differs from the output (foster parenting, say) is not a way in; the
  // property is that neither the copy nor a copy of its serialization holds
  // anything that runs, loads or navigates.
  test("keeps nothing that runs, loads or navigates, even when its output is parsed again", () => {
    fc.assert(
      fc.property(fc.array(hostileHtml, { maxLength: 4 }).map((parts) => parts.join("")), (html) => {
        const once = clean(html);
        const container = document.createElement("div");
        container.appendChild(sanitize(once, document, parser));
        for (const element of Array.from(container.querySelectorAll("*"))) {
          expect(["script", "iframe", "object", "embed", "link", "meta", "base", "a", "style", "template", "foreignobject", "use", "image", "animate", "set", "math"])
            .not.toContain(element.localName.toLowerCase());
          for (const attribute of Array.from(element.attributes)) {
            expect(allowedAttribute(element, attribute.name.toLowerCase(), attribute.value)).toBe(true);
          }
        }
      }),
      {
        numRuns: 1_000,
        examples: [
          // Markup that changes meaning when parsed a second time, inside SVG and MathML.
          ['<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">'],
          ['<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'],
          ['<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>'],
          ['<noscript><p title="</noscript><img src=x onerror=alert(1)>">'],
          // Foster parenting: the copy's serialization parses into a different tree.
          ["<p><table><p><td></td></p></table></p>"],
        ],
      },
    );
  });
});
