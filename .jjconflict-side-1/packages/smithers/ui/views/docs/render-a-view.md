---
title: "Render a view"
description: "The module a renderer writes, how a host checks and renders it, how the page shows it inline or full-screen, and how a Worker names its QuickJS build."
---

## The module a renderer writes

A view is one TSX module with a pure component, its declared events, and an
optional `reduce`:

```tsx
import { Badge, Button, Card } from "@smthrs/ui"
import type { ViewProps } from "smithers:view"

type Board = { readonly cells: ReadonlyArray<string>; readonly turn: "X" | "O" }

export const interactions = {
  cell: { kind: "state" },
  again: { kind: "message", label: "Play again" }
} as const

export const reduce = (state: Board, event: { name: string; arg?: string }): Board => {
  const index = Number(event.arg)
  if (event.name !== "cell" || state.cells[index] !== "") return state
  return {
    cells: state.cells.map((cell, at) => (at === index ? state.turn : cell)),
    turn: state.turn === "X" ? "O" : "X"
  }
}

export default function View({ props, state }: ViewProps<Board>) {
  return (
    <Card>
      <Badge>{props.title} · {state.turn}</Badge>
      {state.cells.map((cell, index) => <Button key={index} data-event={"cell:" + index}>{cell}</Button>)}
      <Button data-event="again">Again</Button>
    </Card>
  )
}
```

- **Imports.** `react` (`Fragment`, `createElement`, `Children`,
  `cloneElement`, `isValidElement`; types freely), `@smthrs/ui` (the
  presentation subset, by name), and `smithers:view` (`ViewProps`, `ViewEvent`
  and `event(name, arg?)`, which writes a `data-event` value).
- **Exports.** `default` (the component, given `{ props, state }`),
  `interactions` (an object literal), and `reduce(state, event)`. A `state`
  interaction needs `reduce`. Types may be exported too.
- **Events.** An element with `data-event="name"` or `data-event="name:arg"`
  sends that event when a person clicks it. A `data-event` form, or a
  `data-event` button inside a form, sends the form's named values with it.
- **Pure.** No timers, effects, animation frames, canvas, measuring, network
  or third-party widgets. `ViewCode` refuses the names that reach them;
  [the API reference](api.md#viewcode) lists the rest.

`ViewCode.check` returns every problem at once, with its line and column, so
a renderer corrects the module in one step. The problems quote the module, so
they are redacted; unwrap them only for the correction prompt:

```ts
const checked = ViewCode.check(source, { components: realm.components }).pipe(
  Effect.catchTag("@smthrs/views/ViewCodeError", (error) => Effect.fail(Redacted.value(error.detail)))
)
```

## A host renders it

A host holds one realm and renders through it. The first render loads QuickJS
and the bundle; later renders reuse them.

```ts
const show = (source: string, props: unknown, state: unknown) =>
  Effect.gen(function*() {
    const realm = yield* PresentationRealm.PresentationRealm
    const module = yield* ViewCode.check(source, { components: realm.components })
    return { module, html: yield* realm.render({ module, props, state }) }
  })
```

A `state` event from the frame becomes `realm.interact`, which runs `reduce`
and renders the state it returns:

```ts
const play = (module: ViewCode.CheckedModule, props: unknown, state: unknown, event: Interactions.Event) =>
  Effect.flatMap(PresentationRealm.PresentationRealm, (realm) => realm.interact({ module, props, state, event }))
```

`realm.render` and `realm.interact` fail with `RealmError`. Its `detail` is
written for the renderer and may quote the module or its props, so it is
redacted: read it with `Redacted.value` for a correction prompt, and never log
it. `reason`, `limit` and `message` carry no content, so a span or log line
around the render is safe.

```ts
const correction = (error: PresentationRealm.RealmError) => `Your view failed: ${Redacted.value(error.detail)}`
```

### Measured once

On an Apple Silicon MacBook under Bun 1.4.1, one cold run with the real
`@smthrs/ui` bundle (128 KB): loading QuickJS and the bundle took 215 ms, the
first check 34 ms, and a tic-tac-toe move (`reduce` and a render) 1.8 ms at
the median and 8 ms at the 95th percentile of 50. This is one run on one
machine, not a benchmark.

## The page shows it

`GeneratedView` from `@smthrs/ui` shows the HTML in a sandboxed frame:

```tsx
<GeneratedView
  html={view.html}
  interactions={view.interactions}
  title={view.title}
  theme={theme}
  size="inline"
  onInteraction={(interaction) => dispatch(interaction)}
  onRefused={(reason) => count(reason)}
/>
```

One component, two sizes. `inline` sits in a message and takes the height
the frame reports, between 80 and 480 pixels. `full` fills its container, for
a page of its own. Both render the same frame from the same HTML and state.

When the HTML or theme changes, the component sends only what changed to the
frame over the bridge.

## A Worker names its QuickJS build

workerd refuses to compile WebAssembly from bytes, so a Worker imports the
module its toolchain compiled and names it:

```ts
import wasmfile from "@jitl/quickjs-wasmfile-release-sync"
import wasmModule from "@jitl/quickjs-wasmfile-release-sync/wasm"
import { QuickJSVariant } from "@smthrs/harness"
import { newVariant } from "quickjs-emscripten-core"

const variant = QuickJSVariant.layerVariant(newVariant(wasmfile, { wasmModule }))
```

Everything else is the code Node and the browser run. `test/Workerd.test.ts`
renders the same modules in local workerd and in Node and compares them byte
for byte.
