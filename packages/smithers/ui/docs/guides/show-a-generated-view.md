---
title: "Show a generated view"
description: "Show UI an agent wrote: render it in the presentation realm with the bundle this package ships, show it in GeneratedView's sandboxed frame, and turn clicks into state changes or questions. Plus the form and issues templates."
---

An agent shows complex information as a view: a comparison table, a board, a
form. A template view is this package's own React. A generated view is a TSX
module a renderer agent wrote, which never runs in the page:
[`@smthrs/views`](../../views/docs/README.md) renders it to HTML in a QuickJS
realm, and `GeneratedView` shows that HTML in a sandboxed frame.

## Render it in the realm

The realm loads the presentation bundle this package ships: React, its static
renderer, and the presentation subset. `loadPresentationBundle` imports it on
first use, so a page that only shows stored views never downloads it.

```ts
import singlefile from "@jitl/quickjs-singlefile-browser-release-sync"
import { QuickJSVariant } from "@smthrs/harness"
import { loadPresentationBundle } from "@smthrs/ui"
import { PresentationRealm, ViewCode } from "@smthrs/views"
import { Effect, Layer } from "effect"

const realm = Layer.unwrap(
  Effect.promise(loadPresentationBundle).pipe(Effect.map((bundle) => PresentationRealm.layer({ bundle })))
).pipe(Layer.provide(QuickJSVariant.layerVariant(singlefile)))

const render = (source: string, props: unknown, state: unknown) =>
  Effect.gen(function*() {
    const presentation = yield* PresentationRealm.PresentationRealm
    const module = yield* ViewCode.check(source, { components: presentation.components })
    return { module, html: yield* presentation.render({ module, props, state }) }
  })
```

A view imports components by name from `@smthrs/ui`. Only the presentation
subset resolves (`presentationComponentNames`): `Alert`, `AlertDescription`,
`AlertTitle`, `Badge`, `Button`, the `Card` family, `EmptyState`, `Eyebrow`,
`Field`, `Input`, `KpiStat`, `Label`, `Progress`, `SectionHeader`,
`Separator`, `StatusPill`, the `Table` family, and `Textarea`. Each renders
from its props alone, and `tests/presentation-conformance.test.tsx` renders
every one in the realm and compares it with React's own output here. A
component joins the subset only with a case there.

## Show it in the page

```tsx
import { GeneratedView } from "@smthrs/ui"

<GeneratedView
  html={view.html}
  interactions={view.module.interactions}
  title="Tic-tac-toe"
  theme={theme}
  size="inline"
  onInteraction={(interaction) => {
    if (interaction._tag === "State") move(interaction.event)
    else ask({ text: interaction.label, data: interaction.values })
  }}
  onRefused={(reason) => refusals.increment(reason)}
/>
```

- **The frame.** `<iframe sandbox="allow-scripts" srcdoc>`, whose CSP admits
  only the frame runtime (`frameRuntime`), pinned by its hash. The runtime
  sanitizes the HTML (`sanitizeViewHtml`), applies the theme, reports the
  content's height, and turns a real click on a `data-event` element into an
  interaction. No model code runs in it.
- **Events.** `onInteraction` receives only events the module declared. A
  `State` event changes the view's state: run `realm.interact` and pass the new
  HTML back as `html`. A `Message` event becomes a question with its `label`
  and form `values`. Hidden inputs and controls hidden by ancestors or CSS
  are excluded from those values.
- **Refusals.** `onRefused` receives a reason only: `wrong_source`,
  `malformed`, `too_large`, `undeclared` or `rate_limited`. Count it; never log
  a message's content. Sibling views ignore each other's initialization
  broadcasts; each still validates its own source, nonce and single port.
- **Sizes.** `inline` takes the height the frame reports, from 80 to 480
  pixels. `full` fills its container. Both render the same frame from the
  same HTML.
- **Visibility.** The frame mounts only while it is near the screen, and each
  mount writes a new nonce.

The browser probes in `browser/generated-view.browser.test.ts` check, in
Chromium, that a hostile view reaches neither the page's DOM, its storage, the
network, nor any navigation, and that inline handlers never run.

## The form template

`FlowFormView` asks the person for input with fields derived from a JSON
Schema, through `declaredInput` and `formFieldsFor`:

```tsx
<FlowFormView
  title="Clone a repository"
  schema={{ type: "object", properties: { url: { type: "string", title: "URL" } }, required: ["url"] }}
  submitLabel="Clone"
  submitted={row.state.submitted}
  values={row.state.values}
  onSubmit={({ text, data, writeOnly }) => ask({ text, data, source: { viewId, event: "submit" }, writeOnly })}
/>
```

Submit calls `onSubmit` once with the label as `text` and the values as
`data`; `writeOnly` names the secret fields, so the host keeps them out of
synced rows. A required field left blank blocks submit. Once `submitted`, the
form is disabled and shows `values`, never a write-only one.

## The issues template

`IssuesView` lists issues the host passed in, with no navigation unless the
host passes `href` (see [the API reference](../api.md#templates-forms-and-issues)):

```tsx
<IssuesView repo="maya/tinyhttp" issues={issues} size="inline" />
```

Each row shows the state, title, labels, number, author, date and comment
count. `inline` scrolls inside 320 pixels; `full` shows every row.
