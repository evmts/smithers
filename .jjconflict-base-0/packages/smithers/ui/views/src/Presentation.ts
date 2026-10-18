/**
 * The realm half of a presentation bundle: the code that runs inside QuickJS
 * and renders a checked view module to HTML.
 *
 * A presentation bundle is one classic script that calls {@link install}
 * with React, React's JSX runtime, `renderToStaticMarkup` and the components a
 * view may import. `@smthrs/ui` builds the one Smithers ships; this module
 * takes React as arguments, so it carries no framework of its own and a test
 * can build a bundle from React alone.
 *
 * `install` publishes `globalThis.__smithersPresentation`, which
 * `PresentationRealm` calls, and then freezes every object reachable from
 * the realm's global, so one view cannot change what the next one renders.
 *
 * A view module reaches four modules through `require`: `react` and
 * `react/jsx-runtime` (whose element constructors refuse the elements and
 * attributes `ViewCode` refuses, so a spread cannot smuggle one in),
 * `@smthrs/ui` (the components passed here), and `smithers:view`, whose one
 * value is `event(name, arg?)`, the `data-event` attribute for an event.
 *
 * @since 0.1.0
 */

import { harden } from "./internal/harden.ts"
import { attributeRefusal, isRefusedElement } from "./internal/vocabulary.ts"

/**
 * The global name `install` publishes the renderer under.
 *
 * @category constants
 * @since 0.1.0
 */
export const globalName = "__smithersPresentation"

/**
 * An element constructor: `createElement`, `jsx` or `jsxs`. Its parameters
 * are `any` so React's own overloads fit it.
 *
 * @category models
 * @since 0.1.0
 */
export type CreateElement = (type: any, props?: any, ...rest: Array<any>) => unknown

/**
 * What a bundle passes to {@link install}.
 *
 * @category models
 * @since 0.1.0
 */
export interface InstallOptions {
  /** React's root module. Only `Fragment`, `createElement`, `Children`, `cloneElement` and `isValidElement` reach a view. */
  readonly react: {
    readonly Fragment: unknown
    readonly createElement: CreateElement
    readonly Children: unknown
    readonly cloneElement: CreateElement
    readonly isValidElement: (value: any) => boolean
  }
  /** `react/jsx-runtime`. */
  readonly jsxRuntime: { readonly Fragment: unknown; readonly jsx: CreateElement; readonly jsxs: CreateElement }
  /** `react-dom/server`'s `renderToStaticMarkup`. */
  readonly renderToStaticMarkup: (element: any) => string
  /** The components a view may import from `@smthrs/ui`, by name. */
  readonly components: Readonly<Record<string, unknown>>
}

/**
 * A module's evaluator: the compiled CommonJS body of a checked view, wrapped
 * as `function (require, module, exports) { ... }` by the host.
 *
 * @category models
 * @since 0.1.0
 */
export type ModuleFactory = (
  require: (name: string) => unknown,
  module: { exports: Record<string, unknown> },
  exports: Record<string, unknown>
) => void

/**
 * What `install` publishes. Every input and output is a JSON string, so no
 * object crosses between the realm and the host.
 *
 * @category models
 * @since 0.1.0
 */
export interface Installed {
  /** Renders the module's default export with `{ props, state }` to HTML. */
  readonly render: (factory: ModuleFactory, props: string, state: string) => string
  /** Runs the module's `reduce(state, event)` and returns the next state as JSON. */
  readonly reduce: (factory: ModuleFactory, state: string, event: string) => string
  /** The component names `@smthrs/ui` resolves to, sorted. */
  readonly components: ReadonlyArray<string>
}

const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)

/** Refuses what `ViewCode` refuses, for an element built at render time. */
const guard = (type: unknown, props: unknown): void => {
  const element = typeof type === "string" ? type : ""
  if (element !== "" && isRefusedElement(element)) throw new Error(`<${element}> is refused in a view`)
  if (typeof props !== "object" || props === null) return
  for (const key of Object.keys(props)) {
    const refusal = attributeRefusal(element, key, (props as Record<string, unknown>)[key])
    if (refusal !== undefined) throw new Error(refusal)
  }
}

const guarded = (create: CreateElement): CreateElement => (type, props, ...rest) => {
  guard(type, props)
  return create(type, props, ...rest)
}

const exportsOf = (factory: ModuleFactory, require: (name: string) => unknown): Record<string, unknown> => {
  const module: { exports: Record<string, unknown> } = { exports: {} }
  factory(require, module, module.exports)
  return module.exports
}

/**
 * Builds the renderer without publishing it: what {@link install} publishes.
 *
 * @category installing
 * @since 0.1.0
 */
export const make = (options: InstallOptions): Installed => {
  const { jsxRuntime, react, renderToStaticMarkup } = options
  const components = Object.freeze({ ...options.components })
  const modules: Readonly<Record<string, unknown>> = {
    "react": Object.freeze({
      Fragment: react.Fragment,
      createElement: guarded(react.createElement),
      Children: react.Children,
      cloneElement: guarded(react.cloneElement),
      isValidElement: react.isValidElement
    }),
    "react/jsx-runtime": Object.freeze({
      Fragment: jsxRuntime.Fragment,
      jsx: guarded(jsxRuntime.jsx),
      jsxs: guarded(jsxRuntime.jsxs)
    }),
    "@smthrs/ui": components,
    "smithers:view": Object.freeze({
      event: (name: string, arg?: string | number): string => arg === undefined ? name : `${name}:${String(arg)}`
    })
  }
  const require = (name: string): unknown => {
    if (own(modules, name)) return modules[name]
    throw new Error(`A view may import only react, @smthrs/ui and smithers:view, not ${name}`)
  }
  const installed: Installed = {
    render: (factory, props, state) => {
      const view = exportsOf(factory, require).default
      if (typeof view !== "function" && (typeof view !== "object" || view === null)) {
        throw new TypeError("The module's default export must be a component")
      }
      const html = renderToStaticMarkup(jsxRuntime.jsx(view, { props: JSON.parse(props), state: JSON.parse(state) }))
      return html
    },
    reduce: (factory, state, event) => {
      const reduce = exportsOf(factory, require).reduce
      if (typeof reduce !== "function") throw new TypeError("The module exports no reduce function")
      const next = JSON.stringify(reduce(JSON.parse(state), JSON.parse(event)))
      if (next === undefined) throw new TypeError("reduce returned no state")
      return next
    },
    components: Object.keys(components).sort()
  }
  return installed
}

/* v8 ignore start -- publishing freezes the global it runs in, so it runs only inside a presentation realm, where PresentationRealm's tests drive it */
/**
 * Publishes the renderer at `globalThis.__smithersPresentation` and freezes
 * every object reachable from the realm's global. Call it once, as the
 * bundle's last statement.
 *
 * @category installing
 * @since 0.1.0
 */
export const install = (options: InstallOptions): Installed => {
  const installed = make(options)
  Object.defineProperty(globalThis, globalName, { value: installed, enumerable: false })
  harden(globalThis)
  return installed
}
/* v8 ignore stop */
