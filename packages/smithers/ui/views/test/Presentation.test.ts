import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { runInNewContext } from "node:vm"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as jsxRuntime from "react/jsx-runtime"
import { describe, expect, it } from "vitest"
import { Presentation } from "../src/index.ts"
import { harden } from "../src/internal/harden.ts"
import { legacyServer } from "./fixtures/bundle.ts"

const Card = ({ children }: { readonly children?: React.ReactNode }) =>
  jsxRuntime.jsx("div", { className: "sui-card", children })

const installed = Presentation.make({
  react: React,
  jsxRuntime,
  renderToStaticMarkup,
  components: { Card, Badge: Card }
})

type Require = (name: string) => any

/** A module factory written directly, as the host's wrapper would evaluate one. */
const factory =
  (body: (require: Require, exports: Record<string, unknown>) => void): Presentation.ModuleFactory =>
  (require, _module, exports) => body(require, exports)

const view = (render: (require: Require, input: { props: any; state: any }) => unknown) =>
  factory((require, exports) => {
    exports.default = (input: { props: unknown; state: unknown }) => render(require, input as never)
  })

describe("Presentation.make", () => {
  it("renders the default export with parsed props and state", () => {
    const module = view((require, { props, state }) =>
      require("react/jsx-runtime").jsx(require("@smthrs/ui").Card, { children: `${props.title}:${state.n}` })
    )
    expect(installed.render(module, "{\"title\":\"Hi\"}", "{\"n\":2}")).toBe("<div class=\"sui-card\">Hi:2</div>")
  })

  it("accepts a memo or forwardRef component object as the default export", () => {
    const module = factory((require, exports) => {
      exports.default = React.memo(() => require("react").createElement("p", null, "memo"))
    })
    expect(installed.render(module, "{}", "null")).toBe("<p>memo</p>")
  })

  it("refuses a default export that is not a component", () => {
    for (const value of [undefined, null, 1, "View"]) {
      expect(() =>
        installed.render(
          factory((_, exports) => {
            exports.default = value
          }),
          "{}",
          "null"
        )
      ).toThrow("The module's default export must be a component")
    }
  })

  it("resolves only the three view modules", () => {
    const seen: Array<unknown> = []
    installed.render(
      view((require) => {
        seen.push(
          require("react").Fragment,
          require("smithers:view").event("cell", 4),
          require("smithers:view").event("again")
        )
        return null
      }),
      "{}",
      "null"
    )
    expect(seen).toEqual([React.Fragment, "cell:4", "again"])
    for (const name of ["fs", "react-dom", "constructor", "__proto__", "toString"]) {
      expect(() => installed.render(view((require) => require(name)), "{}", "null")).toThrow(
        `A view may import only react, @smthrs/ui and smithers:view, not ${name}`
      )
    }
  })

  it("hands a view React's safe values only, frozen", () => {
    let react: Record<string, unknown> = {}
    installed.render(
      view((require) => {
        react = require("react")
        return null
      }),
      "{}",
      "null"
    )
    expect(Object.keys(react).sort()).toEqual([
      "Children",
      "Fragment",
      "cloneElement",
      "createElement",
      "isValidElement"
    ])
    expect(Object.isFrozen(react)).toBe(true)
    expect((react.isValidElement as (value: unknown) => boolean)(React.createElement("p"))).toBe(true)
  })

  it("refuses refused elements and attributes at render time, through every constructor", () => {
    const attempts: ReadonlyArray<readonly [(require: Require) => unknown, string]> = [
      [(require) => require("react/jsx-runtime").jsx("script", {}), "<script> is refused in a view"],
      [(require) => require("react/jsx-runtime").jsxs("iframe", { children: [] }), "<iframe> is refused in a view"],
      [(require) => require("react").createElement("A", null), "<A> is refused in a view"],
      [
        (require) => require("react").createElement("div", { onClick: () => 1 }),
        "`onClick` is an event handler; a view sends events with data-event instead"
      ],
      [
        (require) => require("react").createElement(require("@smthrs/ui").Card, { href: "/x" }),
        "`href` is refused in a view"
      ],
      [
        (require) =>
          require("react").cloneElement(require("react").createElement("p"), {
            dangerouslySetInnerHTML: { __html: "<b>" }
          }),
        "`dangerouslySetInnerHTML` is refused in a view"
      ],
      [
        (require) => require("react").createElement("img", { src: "https://evil.example/p.png" }),
        "`src` is allowed only on <img>, as a data:image URL"
      ]
    ]
    for (const [render, message] of attempts) {
      expect(() => installed.render(view(render), "{}", "null")).toThrow(message)
    }
  })

  it("lets safe elements and data:image sources through", () => {
    const html = installed.render(
      view((require) =>
        require("react").createElement("img", { alt: "dot", src: "data:image/png;base64,AA", "data-event": "go" })
      ),
      "{}",
      "null"
    )
    expect(html).toBe("<img alt=\"dot\" src=\"data:image/png;base64,AA\" data-event=\"go\"/>")
  })

  it("runs reduce and returns the next state as JSON", () => {
    const module = factory((_, exports) => {
      exports.reduce = (state: { n: number }, event: { name: string; arg?: string }) => ({
        n: state.n + Number(event.arg)
      })
    })
    expect(installed.reduce(module, "{\"n\":1}", "{\"name\":\"add\",\"arg\":\"2\"}")).toBe("{\"n\":3}")
  })

  it("refuses an interaction on a module without reduce, or a reduce that returns nothing", () => {
    expect(() => installed.reduce(factory(() => {}), "null", "{}")).toThrow("The module exports no reduce function")
    expect(() =>
      installed.reduce(
        factory((_, exports) => {
          exports.reduce = () => undefined
        }),
        "null",
        "{}"
      )
    ).toThrow("reduce returned no state")
  })

  it("lists its components sorted, and evaluates each module afresh", () => {
    expect(installed.components).toEqual(["Badge", "Card"])
    let evaluations = 0
    const module = view(() => {
      evaluations += 1
      return null
    })
    installed.render(module, "{}", "null")
    installed.render(module, "{}", "null")
    expect(evaluations).toBe(2)
  })
})

/** React's static renderer as `guardRenderer` patches it, evaluated here with `guardHost` as its guard. */
const guardedRenderer = (): (element: unknown) => string => {
  const module = { exports: {} as { renderToStaticMarkup: (element: unknown) => string } }
  const evaluate = new Function(
    "module",
    "exports",
    "require",
    Presentation.hostGuardName,
    Presentation.guardRenderer(
      readFileSync(legacyServer, "utf8")
    )
  )
  evaluate(module, module.exports, createRequire(legacyServer), Presentation.guardHost)
  return module.exports.renderToStaticMarkup
}

describe("Presentation.guardRenderer", () => {
  const render = guardedRenderer()
  const elementType = (React.createElement("p") as unknown as { $$typeof: symbol }).$$typeof

  it("refuses what the guard refuses, however the element was built", () => {
    const forged = { $$typeof: elementType, type: "script", key: null, ref: null, props: { children: "alert(1)" } }
    expect(() => render(forged)).toThrow("<script> is refused in a view")
    expect(() =>
      render(React.createElement("div", { dangerouslySetInnerHTML: { __html: "<img src=x onerror=alert(1)>" } }))
    )
      .toThrow("`dangerouslySetInnerHTML` is refused in a view")
    expect(() => render(React.createElement("p", null, React.createElement("iframe")))).toThrow(
      "<iframe> is refused in a view"
    )
  })

  it("emits the props the guard read, so a getter cannot answer the two differently", () => {
    let reads = 0
    const props = {
      alt: "",
      get src() {
        return reads++ === 0 ? "data:image/png;base64,AA" : "https://evil.example/p.png"
      }
    }
    expect(render(jsxRuntime.jsx("img", props))).toBe("<img alt=\"\" src=\"data:image/png;base64,AA\"/>")
    expect(reads).toBe(1)
  })

  it("renders what it admits exactly as React does", () => {
    const tree = React.createElement(
      "section",
      { className: "k", style: { gridTemplateColumns: "1fr" }, "data-event": "go" },
      "a < b",
      React.createElement("svg", { viewBox: "0 0 1 1", strokeWidth: 2 }, React.createElement("circle", { r: 1 }))
    )
    expect(render(tree)).toBe(renderToStaticMarkup(tree))
  })

  it("refuses a renderer it cannot find the one place to guard in", () => {
    const start = "function pushStartInstance(target, type, props, state) {}"
    for (const source of ["function other() {}", `${start}\n${start}`]) {
      expect(() => Presentation.guardRenderer(source)).toThrow(
        "React's static renderer has no single pushStartInstance(target, type, props, ...) to guard"
      )
    }
    expect(Presentation.guardRenderer(start)).toBe(
      "function pushStartInstance(target, type, props, state) {\n  props = __smithersHostGuard(type, props);}"
    )
  })
})

describe("Presentation.guardHost", () => {
  it("returns a frozen copy of an element's own enumerable props, and none for no props", () => {
    const props = { title: "t" }
    const copy = Presentation.guardHost("p", props)
    expect(copy).toEqual(props)
    expect(copy).not.toBe(props)
    expect(Object.isFrozen(copy)).toBe(true)
    expect(Presentation.guardHost("br", null)).toEqual({})
    expect(Presentation.guardHost("label", { htmlFor: "u", onMouseDown: () => 1, onclick: "alert(1)" })).toEqual({
      htmlFor: "u"
    })
    expect(() => Presentation.guardHost("p", { href: "/x" })).toThrow("`href` is refused in a view")
  })
})

describe("harden", () => {
  it("freezes everything reachable: values, prototypes, accessors and cycles", () => {
    // Built in a context of its own, so freezing its intrinsics leaves this process's alone.
    const graph = runInNewContext(`
      class Base { method() { return 1 } }
      const getter = () => 1
      const setter = (_) => {}
      const root = { nested: { list: [1, { deep: true }] }, instance: new Base() }
      Object.defineProperty(root, "accessor", { get: getter, set: setter, enumerable: true })
      root.self = root
      ;({ root, Base, getter, setter, objectPrototype: Object.prototype, arrayPrototype: Array.prototype })
    `) as Record<string, any>
    harden(graph.root)
    expect(Object.isFrozen(graph.root)).toBe(true)
    expect(Object.isFrozen(graph.root.nested.list[1])).toBe(true)
    expect(Object.isFrozen(graph.Base.prototype)).toBe(true)
    expect(Object.isFrozen(graph.getter)).toBe(true)
    expect(Object.isFrozen(graph.setter)).toBe(true)
    expect(Object.isFrozen(graph.objectPrototype)).toBe(true)
    expect(Object.isFrozen(graph.arrayPrototype)).toBe(true)
    expect(Object.isFrozen(Object.prototype)).toBe(false)
  })

  it("ignores primitives", () => {
    expect(() => {
      harden(null)
      harden(1)
      harden("text")
    }).not.toThrow()
  })
})

it("an own __proto__ prop cannot give the guarded copy unchecked inherited attributes", () => {
  const props = JSON.parse("{\"__proto__\":{\"href\":\"https://example.com\"},\"title\":\"safe\"}")
  const copy = Presentation.guardHost("p", props)
  expect(Object.getPrototypeOf(copy)).toBeNull()
  expect(Object.hasOwn(copy, "__proto__")).toBe(true)
  expect(copy.href).toBeUndefined()
  expect(copy.title).toBe("safe")
})
