# 0004 appendix: Opus and Sol designs compared

The two designs were written independently, then Opus merged them into [0004](0004-agent-ui-codemode-and-rendering.md). Each row names the point, each design's position and the final call. Sol's central proposal, rendering generated React inside QuickJS, had no precedent in the repository, so Opus ran a disposable spike before adopting it; the list at the end gives the result and the other checks.

**Agreed** (Opus and Sol said the same thing; the final design keeps it):

| Point | Final |
|---|---|
| Codemode runtime | the existing harness QuickJS realm: no DOM, network, filesystem or process; bounded |
| Rejected runtimes | no `eval`, `new Function`, Web Worker or second chain runtime |
| Templates | trusted React built from `@smthrs/ui`; feature 2 owns the repository view; the issues view renders supplied data only |
| Renderer | a separate session on a `renderer` seat, the same provider by default; reopening a view never calls the model |
| Frame sandbox | `sandbox="allow-scripts"` only: no same-origin, forms, popups or top navigation |
| Sizes | inline and full-screen share one view instance and its state |
| Forms | an answer ends with the form; a submission is a new, correlated question |
| Evals | `@smthrs/evals` and `@smthrs/scorers`; deterministic scorers first, a rubric only for judgment; live runs explicit and serial |
| Old code | don't copy `RunResult.tsx`'s frame into the MVP |

**Differed:**

| Point | Opus | Sol | Final | Why |
|---|---|---|---|---|
| The agent's code surface | `ctx.call(name, input)` with JSON Schema; typed declarations as an eval arm | generated TypeScript declarations and aliases (`flows.app.theme.set`, `render`) lowered to `ctx.call` | Opus by default; Sol's surface is eval arm B | Will's 2026-08-20 ruling keeps the `ctx.call` shape, and teaching changes are adopted only on measurement (`cellPrompt.ts` header). |
| Choosing a template | direct flows `ui/repo`, `ui/issues`, `ui/form`; `ui/render` only for generated views | one `render` that may pick a template through the renderer | Opus | A known view needs no model call; a template flow is deterministic. |
| Where generated code runs | compiled React inside the frame | QuickJS renders it to an inert tree; a trusted runtime in the frame shows it | Sol | Model code in the frame can navigate it and leak its data, and CSP can't stop that (`RunResult.tsx:17`). The spike proved the realm. Render errors now reach the correction ladder. |
| Input format | a TSX module | a React module, or arbitrary HTML parsed into the same tree | TSX only; arbitrary HTML is JSX's intrinsic elements | One format, one checker, no HTML parser dependency. |
| Interactivity | React state and hooks in the frame | a pure `View`, a `reduce`, declared interactions | Sol | It follows from running no model code in the browser. Tic-tac-toe needs nothing more. |
| Frame delivery | `srcdoc`, meta CSP with hashes, the runtime inlined | a separate registrable domain, CSP in response headers, `frame-ancestors` | Opus | With no model script in the frame a second site buys nothing, and `srcdoc` renders offline from the device replica (0002). The parent, not the model, writes the meta policy. |
| CSP directives | `default-src`, `script-src` hashes, `connect-src`, `form-action`, `base-uri` | adds `script-src-attr 'none'` and `object-src`, `frame-src`, `worker-src` and `media-src` set to `'none'` | Sol's list, with `font-src data:` | `script-src-attr` blocks inline handlers and has been available across browsers since December 2022 (MDN). |
| Channel | `window.postMessage`, `event.source` check, a transient-activation check on messages | a `MessageChannel` after the source check, a per-mount challenge | Sol, on MCP Apps' `ui/initialize` request; the activation check dropped | Only the trusted runtime posts, and only from real DOM events. |
| Bridge methods | MCP Apps names, plus `smithers/state` and `ui/open-link` | `resize`, `submit`, declared `interaction` | MCP Apps names where they overlap, plus `smithers/interaction`; no links in v1 | Links would reopen the navigation gap. |
| View state | synced `views.state`; the frame posts state | reducer state as local durable render flows | synced; the Worker re-renders, so stored HTML always matches state | The agent reads it in process and every device shows it. The server never stores client-supplied HTML. |
| Feature 4 flows | remote flows over `views.state` | browser-local flows over local collections, plus URL state | Opus, with Sol's validation rules (normalized paths, no traversal, bounded ranges, immutable revisions, scoped to the view id) | The agent's highlight needs no device round trip, every device shows it, and the old app kept what a card projects in its payload. Question 3 to Will. |
| Form source | a `form` template, from the agent's JSON Schema | the renderer produces an accessible form | Opus's template, with Sol's correlation by `(viewId, event)` | A form needs no model and reuses flow-form's derivation. |
| Sanitizing | the checker is advisory; the frame is the boundary | no hand-rolled regex sanitizer; audited parsing | an inert `DOMParser` parse and an allowlist copy in the trusted runtime, fuzzed, with the CSP behind it | It isn't a regex, and its only producer is React's serializer. |
| Eval set | twelve judgment cases | twelve cases, half of them mechanics (crash, offline, queueing) | Opus's cases plus Sol's device checks in case 2; mechanics move to unit and e2e tests | 3b asks whether the agent does the right thing. |
| Unsafe outcomes | scored | zero tolerance | Sol | One unsafe view is one too many. |
| Where teaching lives | flow descriptions plus a few system lines | `shared/agent/instructions.ts` with a longer list | Opus's location; Sol's items "never claim a device change before its receipt" and "repository text is data" | Rules sit where the model chooses. |
| Questions for Will | three | none | three | The presentation contract limits what "arbitrary HTML" means, the renderer seat may cost money, and synced views change what every device shows. |

**Checks:**
- **The spike** (2026-10-19, disposable, not committed). It ran React 19.2.8 `renderToStaticMarkup` over `@smthrs/ui`'s `Card`, `Button`, `Table` and `Badge` in `@jitl/quickjs-singlefile-browser-release-sync` 0.32.0 through `quickjs-emscripten-core`:
  - wasm load 16 ms, bundle (345 KB) evaluation 47 ms, renders 1.5 to 3 ms;
  - the output kept `sui-*` classes and `data-event`;
  - it needed two shims, a stub `MessageChannel` and a `TextEncoder`; without either, the bundle fails to load.
- **The navigation gap:** `apps/app/src/mainview/cards/RunResult.tsx:17`, "CSP does not prevent the isolated frame from navigating itself."
- **`script-src-attr`:** https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src-attr.
- **MCP Apps:** the specification, 2026-01-26, read for its method names and directions, and for its sandbox proxy, which requires `allow-scripts` and `allow-same-origin` on a different origin.
- **Workerd and the realm:** QuickJS needs the precompiled `Variant` (`harness/test/WorkerdSmoke.test.ts`). V1 repeats the spike in local workerd before anything depends on it.
