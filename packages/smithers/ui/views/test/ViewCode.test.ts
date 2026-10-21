import { Effect, Redacted } from "effect"
import { describe, expect, it } from "vitest"
import { ViewCode } from "../src/index.ts"
import { comparison, components, ticTacToe, viewWith } from "./fixtures/modules.ts"

const check = (source: string) => Effect.runSync(ViewCode.check(source, { components }))
const refusal = (source: string) => Effect.runSync(Effect.flip(ViewCode.check(source, { components })))
const problems = (source: string) => Redacted.value(refusal(source).problems)
const messages = (source: string) => problems(source).map((problem) => problem.message)

describe("ViewCode.check accepts", () => {
  it("tic-tac-toe, with its interactions read and its reduce noticed", () => {
    const checked = check(ticTacToe)
    expect(checked.interactions).toEqual({
      cell: { kind: "state" },
      again: { kind: "message", label: "Play again" }
    })
    expect(checked.reduces).toBe(true)
    expect(checked.source).toBe(ticTacToe)
    expect(checked.digest).toMatch(/^[0-9a-f]{64}$/)
    expect(checked.compiled).toContain("require('@smthrs/ui')")
    expect(checked.compiled).toContain("require(\"react/jsx-runtime\")")
    expect(checked.compiled).not.toContain("import ")
  })

  it("accepts an explicit class constructor while refusing constructor access", () => {
    expect(
      check(
        "class Value { n: number; constructor(n: number) { this.n = n } } export default () => <p>{new Value(3).n}</p>"
      ).compiled
    ).toContain("constructor")
    expect(messages("export default () => <p>{({}).constructor}</p>").join(" ")).toContain("constructor")
  })

  it("a view with no interactions", () => {
    const checked = check(comparison)
    expect(checked.interactions).toEqual({})
    expect(checked.reduces).toBe(false)
  })

  it("the forms a module may legitimately take", () => {
    const accepted = [
      "import React from \"react\"\nexport default () => React.createElement(React.Fragment, null, \"x\")",
      "import * as React from \"react\"\nexport default function View() { return React.createElement(\"p\", null) }",
      "import { Fragment, Children } from \"react\"\nexport default function View() { return <Fragment>{Children.count([])}</Fragment> }",
      "import { type ReactNode } from \"react\"\nimport type { CSSProperties } from \"react\"\nexport default function View(): ReactNode { return null }",
      "import { event, ViewProps } from \"smithers:view\"\nexport const interactions = { go: { kind: \"message\", label: \"Go\" } }\nexport default function View(_: ViewProps) { return <button data-event={event(\"go\")}>Go</button> }",
      "function View() { return <img alt=\"dot\" src=\"data:image/png;base64,iVBORw0KGgo=\" /> }\nexport { View as default }",
      "export interface Props { readonly n: number }\nexport type State = number\nexport default function View({ props }: { props: Props }) { return <p>{props.n as number}</p> }",
      "enum Kind { A, B }\nexport default function View() { return <p>{Kind.B}</p> }",
      "export const interactions = { pick: { kind: \"state\" } } satisfies Record<string, unknown>\nexport function reduce(state: number) { return state + 1 }\nexport default function View() { return <p data-event=\"pick:1\">pick</p> }",
      "export default function View() { const top3 = [1, 2, 3]; const x = { top: 1, parent: 2 }; return <p title=\"javascript\">{x.top + top3.length}</p> }",
      "export default function View() { outer: for (const a of [1]) { break outer } return <form><input name=\"q\" /><select name=\"s\"><option>1</option></select><textarea name=\"t\" /></form> }",
      "class Board { cells = [1] }\nexport default function View() { return <p>{new Board().cells.length}</p> }",
      "function Cell() { return new.target ? 1 : 0 }\nexport default function View() { const [, second] = [1, 2]; return <p>{second + Cell()}</p> }"
    ]
    for (const source of accepted) expect(() => check(source)).not.toThrow()
  })
})

describe("ViewCode.check refuses", () => {
  it("a module over 64 KB", () => {
    const error = refusal(viewWith(`const s = "${"x".repeat(ViewCode.maxSourceBytes)}"`))
    expect(error.reason).toBe("too_large")
  })

  it("text with a lone surrogate", () => {
    expect(refusal(viewWith("const s = \"\ud800\"")).reason).toBe("malformed_text")
    expect(refusal(viewWith("const s = \"\udc00\"")).reason).toBe("malformed_text")
    expect(check(viewWith("const s = \"🙂\"")).source).toContain("🙂")
  })

  it("a syntax error, with its place", () => {
    const error = refusal("export default function View() { return <div> }")
    expect(error.reason).toBe("syntax")
    expect(Redacted.value(error.problems)[0]).toMatchObject({ line: 1 })
    expect(Redacted.value(error.detail)).toMatch(/^1:\d+: /)
    expect(error.message).toBe("The view's module does not parse")
  })

  it("a module the parser accepts and the compiler does not, as a typed syntax error", () => {
    // Fuzz counterexample: @babel/parser reads `<T,>as"x"` after a string; sucrase does not.
    const error = refusal("export default function View() { return 'y'<T,>as\"x\" }")
    expect(error.reason).toBe("syntax")
    expect(Redacted.value(error.problems)[0]).toMatchObject({ line: 1, column: 47 })
  })

  it("a module nested too deeply to parse", () => {
    const error = refusal(`export default function View() { return ${"[".repeat(20_000)}${"]".repeat(20_000)} }`)
    expect(error.reason).toBe("syntax")
  })

  it("imports outside the three modules, and namespace imports of the components", () => {
    expect(messages("import x from \"https://evil.example/x.js\"\nexport default () => null")).toEqual([
      "A view may import only react, @smthrs/ui and smithers:view, not https://evil.example/x.js"
    ])
    expect(messages("import * as UI from \"@smthrs/ui\"\nexport default () => null")).toEqual([
      "Import named components from @smthrs/ui, not a namespace or default"
    ])
    expect(messages("import { Dialog } from \"@smthrs/ui\"\nexport default () => null")).toEqual([
      "@smthrs/ui has no view component Dialog; use one of Badge, Button, Card"
    ])
    expect(messages("import { useEffect } from \"react\"\nexport default () => null")).toEqual([
      "react has no view value useEffect; import types with `import type`"
    ])
    expect(messages("import { secret } from \"smithers:view\"\nexport default () => null")).toEqual([
      "smithers:view has no view value secret; import types with `import type`"
    ])
    expect(messages("import React from \"react\"\nexport default () => { React.useEffect(() => {}); return null }"))
      .toEqual([
        "React.useEffect is refused in a view; use Children, Fragment, cloneElement, createElement, isValidElement"
      ])
  })

  it("dynamic import, import.meta, require-style modules and re-exports", () => {
    expect(messages(viewWith("import(\"x\")"))).toEqual(["Dynamic import() is refused in a view"])
    expect(messages(viewWith("const u = import.meta.url"))).toEqual(["import.meta is refused in a view"])
    expect(messages("import fs = require(\"fs\")\nexport default () => null")).toContain(
      "A view may not use require-style imports or exports"
    )
    expect(messages("export * from \"react\"\nexport default () => null")).toEqual([
      "A view may not re-export another module"
    ])
    expect(messages("export { Card } from \"@smthrs/ui\"\nexport default () => null")).toEqual([
      "A view may not re-export another module"
    ])
    expect(messages("namespace N { export const a = 1 }\nexport default () => null")).toEqual([
      "Namespaces and declare blocks are refused in a view"
    ])
  })

  it("exports other than default, interactions and reduce", () => {
    expect(messages("export const helper = 1\nexport default () => null")).toEqual([
      "A view exports only default, interactions and reduce, not helper"
    ])
    expect(messages("export function helper() {}\nexport default () => null")).toEqual([
      "A view exports only default, interactions and reduce, not helper"
    ])
    expect(messages("const a = 1\nexport { a }\nexport default () => null")).toEqual([
      "A view exports only default, interactions and reduce, not a"
    ])
    expect(messages("export enum E { A }\nexport default () => null")).toEqual([
      "A view exports only default, interactions and reduce, not E"
    ])
    expect(messages("export const { a } = { a: 1 }\nexport default () => null")).toEqual([
      "A view exports only default, interactions and reduce, not a destructured binding"
    ])
    expect(() => check("type T = number\nexport { type T }\nexport default () => null")).not.toThrow()
    expect(messages("export const x = 1")).toEqual([
      "A view exports only default, interactions and reduce, not x",
      "A view's default export must be its component"
    ])
  })

  it("interactions that are not a literal of declared kinds", () => {
    const shape = "interactions must be an object literal"
    for (
      const value of [
        "makeInteractions()",
        "{ [\"ce\" + \"ll\"]: { kind: \"state\" } }",
        "{ cell: { kind: \"timer\" } }",
        "{ cell: { kind: `state` } }",
        "{ ...base }",
        "{ cell }"
      ]
    ) {
      expect(messages(`export const interactions = ${value}\nexport default () => null`)[0]).toContain(shape)
    }
    expect(messages("const i = {}\nexport { i as interactions }\nexport default () => null")[0]).toContain(shape)
  })

  it("a state interaction without reduce", () => {
    expect(messages("export const interactions = { cell: { kind: \"state\" } }\nexport default () => null")).toEqual([
      "A state interaction needs an exported reduce(state, event)"
    ])
  })

  it("a data-event literal the module does not declare or cannot be parsed", () => {
    expect(messages("export default () => <button data-event=\"move:1\" />")).toEqual([
      "data-event names move, which interactions does not declare"
    ])
    expect(messages("export default () => <button data-event=\"Move now\" />")).toEqual([
      "data-event=\"Move now\" is not \"name\" or \"name:arg\""
    ])
  })

  it("names that reach the network, storage, the page, a clock, randomness or evaluation", () => {
    const names = [
      "fetch",
      "localStorage",
      "document",
      "window",
      "location",
      "top",
      "parent",
      "opener",
      "globalThis",
      "setTimeout",
      "requestAnimationFrame",
      "Date",
      "eval",
      "Function",
      "Proxy",
      "Reflect",
      "WebSocket",
      "XMLHttpRequest",
      "navigator",
      "indexedDB",
      "require",
      "process"
    ]
    for (const name of names) {
      expect(messages(viewWith(`const value = ${name}`))).toEqual([`${name} is refused in a view`])
    }
    expect(messages(viewWith("const n = Math.random()"))).toEqual(["Math.random is refused in a view"])
    expect(messages(viewWith("const n = Math[\"random\"]()"))).toEqual(["Math.random is refused in a view"])
  })

  it("properties that reach constructors, prototypes or raw HTML", () => {
    expect(messages(viewWith("const f = (() => 1).constructor"))).toEqual([
      "The property constructor is refused in a view"
    ])
    expect(messages(viewWith("const f = ({})[\"__proto__\"]"))).toEqual(["The property __proto__ is refused in a view"])
    expect(messages(viewWith("const p = Array.prototype"))).toEqual(["The property prototype is refused in a view"])
    expect(messages(viewWith("const o = { dangerouslySetInnerHTML: 1 }"))).toEqual([
      "The property dangerouslySetInnerHTML is refused in a view"
    ])
    expect(messages(viewWith("const o = { [\"innerHTML\"]: 1 }"))).toEqual([
      "The property innerHTML is refused in a view"
    ])
  })

  it("elements that load, navigate or run script", () => {
    for (
      const element of [
        "script",
        "iframe",
        "object",
        "embed",
        "link",
        "meta",
        "base",
        "a",
        "style",
        "foreignObject",
        "use",
        "animate"
      ]
    ) {
      expect(messages(`export default () => <${element} />`)).toEqual([`<${element}> is refused in a view`])
    }
    expect(messages("import { createElement } from \"react\"\nexport default () => createElement(\"script\", null)"))
      .toEqual([
        "<script> is refused in a view"
      ])
    expect(messages("import React from \"react\"\nexport default () => React.createElement(\"iframe\")")).toEqual([
      "<iframe> is refused in a view"
    ])
    expect(messages("export default () => <svg:a />")[0]).toBe("Namespaced elements are refused in a view")
  })

  it("attributes that load, navigate, submit or handle events", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["<div onClick={() => 1} />", "`onClick` is an event handler; a view sends events with data-event instead"],
      ["<div onclick=\"x()\" />", "`onclick` is an event handler; a view sends events with data-event instead"],
      ["<img src=\"https://evil.example/p.png\" />", "`src` is allowed only on <img>, as a data:image URL"],
      ["<img src={url} />", "`src` is allowed only on <img>, as a data:image URL"],
      ["<div src=\"data:image/png;base64,AA\" />", "`src` is allowed only on <img>, as a data:image URL"],
      ["<form action=\"/x\" />", "`action` is refused in a view"],
      ["<button formAction=\"/x\" />", "`formAction` is refused in a view"],
      ["<img srcSet=\"a.png 1x\" />", "`srcSet` is refused in a view"],
      ["<div dangerouslySetInnerHTML={{ __html: \"<b>\" }} />", "`dangerouslySetInnerHTML` is refused in a view"],
      ["<Card href=\"/x\" />", "`href` is refused in a view"],
      ["<svg xlink:href=\"#a\" />", "Namespaced attributes such as xlink:href are refused in a view"]
    ]
    for (const [element, message] of cases) {
      expect(messages(`import { Card } from "@smthrs/ui"\nexport default () => ${element}`)).toEqual([message])
    }
  })

  it("script URLs and HTML comment tokens anywhere in the text", () => {
    expect(messages(viewWith("const u = \"JavaScript:alert(1)\""))).toEqual(["javascript: URLs are refused in a view"])
    expect(messages(viewWith("const u = `vbscript:${1}`"))).toEqual(["javascript: URLs are refused in a view"])
    expect(messages("export default () => <p>javascript:void(0)</p>")).toEqual([
      "javascript: URLs are refused in a view"
    ])
    expect(messages(viewWith("let n = 2\n  while (n-->0) {}"))).toEqual([
      "HTML comment tokens <!-- and --> are refused in a view"
    ])
    expect(messages(viewWith("const s = \"<!-- note\""))).toEqual([
      "HTML comment tokens <!-- and --> are refused in a view"
    ])
    expect(problems(viewWith("const s = \"<!-- note\""))[0]).toMatchObject({ line: 3, column: 11 })
  })

  it("debugger statements", () => {
    expect(messages(viewWith("debugger"))).toEqual(["debugger is refused in a view"])
  })

  it("with a message that names only its reason, and what it quotes redacted", () => {
    const refused = refusal(viewWith("const privateWords = fetch"))
    expect([
      refusal(viewWith(`const s = "${"x".repeat(ViewCode.maxSourceBytes)}"`)).message,
      refusal(viewWith("const s = \"\ud800\"")).message,
      refusal("export default function View() { return <div> }").message,
      refused.message
    ]).toEqual([
      "The view's module is too large",
      "The view's module is not well-formed text",
      "The view's module does not parse",
      "The view's module does something a view may not"
    ])
    expect(Redacted.value(refused.detail)).toBe("3:21: fetch is refused in a view")
    const named = refusal("export const privateWords = 1\nexport default function View() { return <p /> }")
    expect(Redacted.value(named.detail)).toContain("privateWords")
    for (const printed of [String(named), JSON.stringify(named), String(named.stack), String(named.problems)]) {
      expect(printed).not.toContain("privateWords")
    }
  })

  it("every problem at once, in source order, capped", () => {
    const error = refusal(viewWith(Array.from({ length: 30 }, (_, i) => `const v${i} = fetch`).join("\n")))
    expect(error.reason).toBe("refused")
    expect(Redacted.value(error.problems)).toHaveLength(ViewCode.maxProblems)
    expect(Redacted.value(error.problems).map((problem) => problem.line)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 3)
    )
    expect(Redacted.value(error.detail).split("\n")).toHaveLength(ViewCode.maxProblems)
  })

  it("places a missing default export at the end of the module", () => {
    expect(problems("const a = fetch\n")).toEqual([
      { message: "fetch is refused in a view", line: 1, column: 10 },
      { message: "A view's default export must be its component", line: 2, column: 0 }
    ])
  })
})

describe("ViewCode security regressions", () => {
  it("keeps a quoted __proto__ interaction for schema validation", () => {
    expect(
      messages("export const interactions = { \"__proto__\": { kind: \"state\" } }; export default () => null").join(
        " "
      )
    )
      .toContain("interactions must be an object literal")
  })

  it.each([
    "const value = await 1; export default () => null",
    "for await (const value of []) {} export default () => null",
    "const value = { [await 1]() {} }; export default () => null"
  ])("refuses module-level asynchronous execution: %s", (source) => {
    expect(messages(source).join(" ")).toContain("Top-level await is refused")
  })

  it.each(["__proto__", "constructor", "prototype", "dangerouslySetInnerHTML"])(
    "refuses quoted object key %s",
    (key) => {
      expect(messages(viewWith(`const value = { "${key}": {} }`)).join(" ")).toContain(`The property ${key} is refused`)
    }
  )

  it.each([
    "const math = Math; const value = math.random()",
    "const { random } = Math; const value = random()",
    "const value = Math[`random`]()",
    "const value = Math?.[`random`]()",
    "const key = \"random\"; const value = Math[key]()"
  ])("refuses indirect randomness: %s", (source) => {
    expect(messages(viewWith(source)).join(" ")).toContain("Math.random is refused")
  })

  it("keeps deterministic Math members and nested async functions", () => {
    expect(
      check(
        viewWith(
          "const value = Math.max(1, 2); const pi = Math?.PI; const object = { Math: 1 }; for (const x of []) {} async function later() { for await (const x of []) {} return await 1 }"
        )
      ).compiled
    )
      .toContain("Math.max")
  })
})
