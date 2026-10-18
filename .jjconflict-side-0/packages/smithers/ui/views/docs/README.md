---
title: "@smthrs/views"
description: "Generated views as safe arbitrary output: check a model-written TSX module, render it to HTML in a bounded QuickJS realm, show it in a sandboxed frame pinned by CSP, and admit only its declared events."
---

`@smthrs/views` lets an agent show UI it wrote without running its code in
the browser. A renderer writes a TSX module. `ViewCode` checks and compiles
it, `PresentationRealm` renders it to HTML in a QuickJS realm, and the page
shows the HTML in a frame `ViewCsp` writes. The frame sends back only the
events the module's `interactions` declare, through the `Bridge`.

```
renderer ─▶ TSX module ─▶ ViewCode.check ─▶ PresentationRealm.render ─▶ HTML
page: GeneratedView ─▶ iframe sandbox="allow-scripts" srcdoc (ViewCsp) ─▶ frame runtime
         ◀─ Bridge (MessagePort) ─▶ "state" event: realm.interact ─▶ new HTML
                                    "message" event: a question from the person
```

## What it guarantees

- **No model code in the browser's engine.** A module runs only in a QuickJS
  realm: no network, storage, page, clock or randomness, and every value
  crosses as a JSON string. The frame runs only the page's own runtime.
- **Bounded renders.** Time, interpreter steps, memory, stack, HTML size,
  state size and props size bound every render. An infinite loop, a memory
  bomb or unbounded recursion fails as a typed `RealmError`, and the realm
  loads again for the next render.
- **Views stay apart.** The realm freezes everything reachable from its
  global after the bundle loads, so one module cannot change what the next
  one renders.
- **A pinned frame.** `<iframe sandbox="allow-scripts" srcdoc>` is an opaque
  origin. Its CSP admits only the runtime's hash, forbids inline handlers,
  and loads nothing from the network.
- **Declared events only.** The page refuses a message from any other window,
  a wrong nonce, an undeclared event, form values over 16 KB, and more than
  ten interactions a second.
- **The same render everywhere.** The same module renders byte for byte the
  same in Node, a browser, Bun and local workerd.

## Pages

- [Render a view](render-a-view.md): the module contract, a host's
  composition, sizes, and the workerd host.
- [Security model](security.md): each layer, what it stops, and what is
  tested.
- [API reference](api.md)

## Tests

`pnpm test` runs the suite at 100% coverage of `src/`. The workerd suite
starts Miniflare's local workerd and needs no network. `@smthrs/ui` holds the
rest: the subset's conformance renders in the real bundle, the frame runtime,
the sanitizer and `GeneratedView` under happy-dom, and browser probes in
Chromium (`bun test browser` in `packages/smithers/ui`).
