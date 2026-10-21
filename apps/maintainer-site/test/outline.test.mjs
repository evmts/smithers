// The code view's ranges: comments, folds and symbols from TypeScript's parser, on real files from the repository.
//
//   node --test apps/maintainer-site/test/outline.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, test } from "node:test"
import { fileURLToPath } from "node:url"
import ts from "typescript"
import { LARGE_BLOCK, outlineOf } from "../outline.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const site = join(here, "..")
const repo = join(site, "../..")
const read = (path) => readFileSync(path, "utf8")
const parse = (path) => {
  const text = read(path)
  return { text, lines: text.replace(/\r\n?/g, "\n").split("\n"), ...outlineOf(ts, text, path) }
}

// What every outline of a real file must hold, whatever the file says.
function holds({ lines, comments, folds, symbols }) {
  for (const [from, to] of comments.lines) {
    assert.ok(from <= to)
    for (let line = from; line <= to; line++) {
      const text = lines[line - 1].trim()
      assert.ok(/^(\/\/|\/\*|\*)/.test(text) || text.endsWith("*/"), `line ${line} is a comment: ${text}`)
    }
  }
  for (const [line, from, to] of comments.inline) {
    const text = lines[line - 1].slice(from, to)
    assert.ok(/^(\/\/|\/\*)/.test(text) || text.endsWith("*/"), `line ${line} col ${from} is a comment: ${text}`)
    assert.notEqual(lines[line - 1].slice(0, from).trim(), "", `line ${line} has code beside its comment`)
  }
  let last = 0
  for (const fold of folds) {
    assert.ok(fold.from > last, "one fold per first line, in order")
    last = fold.from
    assert.ok(fold.to > fold.from)
    assert.equal(lines[fold.from - 1][fold.open], "{", `fold at ${fold.from} opens on {`)
    assert.equal(lines[fold.to - 1][fold.close], "}", `fold at ${fold.from} closes on }`)
    if (fold.kind === "block") assert.ok(fold.to - fold.from + 1 >= LARGE_BLOCK)
  }
  for (const [index, symbol] of symbols.entries()) {
    if (index > 0) assert.ok(symbol.line >= symbols[index - 1].line, "symbols are in file order")
    assert.ok(symbol.depth === 0 || symbol.depth <= (symbols[index - 1]?.depth ?? 0) + 1, "a symbol nests at most one deeper than the one before")
    if (!["default", "new"].includes(symbol.kind)) assert.ok(lines[symbol.line - 1].includes(symbol.name.split(/[\s,{}[\]]/).find(Boolean)), `${symbol.name} is on line ${symbol.line}`)
  }
}

describe("the queue's fixture, line by line", () => {
  const outline = parse(join(here, "fixtures/repo/src/shape-stream.ts"))

  test("comment lines: the header, a JSDoc, a block comment in a class, a divider", () => {
    assert.deepEqual(outline.comments, { lines: [[1, 1], [4, 4], [18, 18], [44, 44]], inline: [] })
  })

  test("folds: the interface, the class and its methods, the Effect.gen body, a function; one-line bodies don't", () => {
    assert.deepEqual(
      outline.folds.map(({ from, to, kind }) => [from, to, kind]),
      [
        [5, 8, "class"],
        [13, 28, "class"],
        [19, 23, "function"],
        [25, 27, "function"],
        [33, 37, "function"],
        [39, 42, "function"],
      ],
    )
  })

  test("symbols: declarations in order, members nested, Effect.gen's named steps under their function", () => {
    assert.deepEqual(
      outline.symbols.slice(0, 17).map(({ name, kind, line, depth, exported }) => `${"  ".repeat(depth)}${kind} ${name} ${line}${exported ? " export" : ""}`),
      [
        "type Row 5 export",
        "  prop id 6",
        "  prop offset 7",
        "const DEFAULT_LIMIT 10 export",
        "const greeting 11",
        "class ShapeStream 13 export",
        "  prop rows 14",
        "  new constructor 16",
        "  method push 19",
        "  method latest 25",
        "const decodeRow 30 export",
        "  prop id 30",
        "  prop offset 30",
        "fn load 32 export",
        "  step response 34",
        "  step body 35",
        "fn describe 39 export",
      ],
    )
    assert.equal(outline.symbols.length, 17 + 25, "and the 25 padding constants")
    holds(outline)
  })
})

describe("real files", () => {
  test("ModelStep.ts, the slice Will reviews: JSDoc blocks hide, its functions fold, its generator steps nest", () => {
    const outline = parse(join(repo, "packages/smithers/agent/src/internal/ModelStep.ts"))
    holds(outline)
    assert.ok(outline.comments.lines.length > 20)
    const normalize = outline.symbols.find((symbol) => symbol.name === "normalizeRecordedModelStep")
    assert.deepEqual(normalize && { kind: normalize.kind, depth: normalize.depth, exported: normalize.exported }, { kind: "fn", depth: 0, exported: true })
    const steps = outline.symbols.filter((symbol) => symbol.kind === "step")
    assert.ok(steps.length >= 3, "Effect.gen's named steps are listed")
    for (const step of steps) {
      assert.ok(step.depth > 0)
      assert.match(outline.lines[step.line - 1], /yield\*/)
    }
    assert.ok(outline.folds.some((fold) => fold.kind === "function" && fold.to - fold.from > 50), "a long function body folds")
  })

  test("serve.mjs: `//` inside a regular expression and a URL string is code, not a comment", () => {
    const outline = parse(join(site, "serve.mjs"))
    holds(outline)
    const flagged = new Set([...outline.comments.inline.map(([line]) => line), ...outline.comments.lines.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, index) => from + index))])
    const regex = outline.lines.findIndex((line) => line.includes("^\\/\\//i")) + 1
    const url = outline.lines.findIndex((line) => line.includes("`http://")) + 1
    assert.ok(regex > 0 && url > 0, "the file still has both lines")
    assert.ok(!flagged.has(regex), `line ${regex} holds a regular expression`)
    assert.ok(!flagged.has(url), `line ${url} holds a URL`)
    assert.ok(outline.symbols.some((symbol) => symbol.name === "startServer" && symbol.exported))
  })

  test("client/queue.js: comments beside code are inline; the tokenizer's regular expressions are not comments", () => {
    const outline = parse(join(site, "client/queue.js"))
    holds(outline)
    assert.ok(outline.comments.inline.length > 3)
    const regexes = outline.lines.flatMap((line, index) => (/^\s*const (C_LIKE|CSS|MARKUP) = \//.test(line) ? [index + 1] : []))
    assert.equal(regexes.length, 3)
    for (const line of regexes) assert.ok(!outline.comments.inline.some(([at]) => at === line), `line ${line} is a regular expression`)
    // The whole client is one arrow function: its body folds, and its functions are the outline.
    assert.equal(outline.folds[0].kind, "function")
    assert.ok(outline.symbols.some((symbol) => symbol.name === "renderCode" && symbol.kind === "fn"))
  })

  test("markdown.mjs and outline.mjs hold every invariant", () => {
    holds(parse(join(site, "markdown.mjs")))
    holds(parse(join(site, "outline.mjs")))
  })
})

describe("edges", () => {
  const of = (text, name = "edge.ts") => outlineOf(ts, text, name)

  test("a comment beside code is inline; text in strings, templates and JSX is not a comment", () => {
    const outline = of(
      ['const a = 1 // one', 'const b = "// not a comment"', "const c = `/* nor ${a /* but this is */} */`", "const d = <p>// text</p>", "/* a", "   block */ const e = 2"].join("\n"),
      "edge.tsx",
    )
    assert.deepEqual(outline.comments.inline, [
      [1, 12, 18],
      [3, 22, 39],
      [6, 0, 11],
    ])
    assert.deepEqual(outline.comments.lines, [[5, 5]], "the block's first line holds only comment; its last sits beside code")
  })

  test("CRLF and a byte-order mark give the browser's lines and columns", () => {
    const outline = of("\uFEFF// head\r\nfunction f() {\r\n  return 1 // one\r\n}\r\n")
    assert.deepEqual(outline.comments, { lines: [[1, 1]], inline: [[3, 11, 17]] })
    assert.deepEqual(outline.folds, [{ from: 2, to: 4, open: 13, close: 0, kind: "function" }])
  })

  test(`a statement block folds from ${LARGE_BLOCK} lines; if and else each fold; the outermost wins a shared line`, () => {
    const body = (count) => Array.from({ length: count }, (_, index) => `    x${index}()`).join("\n")
    const outline = of(["function f() {", "  if (a) {", body(LARGE_BLOCK - 2), "  } else {", body(LARGE_BLOCK - 2), "  }", "  if (b) {", body(LARGE_BLOCK - 3), "  }", "}", "call({ a: () => {", "  x()", "} })"].join("\n"))
    assert.deepEqual(
      outline.folds.map(({ from, to, kind }) => [from, to, kind]),
      [
        [1, 18, "function"],
        [2, 7, "block"],
        [7, 12, "block"],
        [19, 21, "object"],
      ],
    )
  })

  test("a flow file: export default, its options, the body's steps; namespaces, enums and class expressions", () => {
    const outline = of(
      [
        'export default Flow.make("tag", {',
        '  description: "d",',
        "  body: (payload) =>",
        "    Effect.gen(function* () {",
        "      const user = yield* Users.get(payload.id)",
        "      yield* Effect.log(user)",
        "      const { a, b } = yield* pair",
        "    }),",
        "})",
        "export namespace N { export const inner = 1 }",
        "enum Color { Red, Green }",
        "const Box = class { open() {} }",
      ].join("\n"),
    )
    assert.deepEqual(
      outline.symbols.map(({ name, kind, depth }) => `${"  ".repeat(depth)}${kind} ${name}`),
      ["default default", "  prop description", "  method body", "    step user", "    step { a, b }", "mod N", "  const inner", "enum Color", "  member Red", "  member Green", "class Box", "  method open"],
    )
  })
})
