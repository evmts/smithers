# `@smthrs/views`

## 0.1.0 (unreleased)

### Added

- `ViewCode.check`: checks a renderer's TSX module (imports, exports, refused
  names, properties, elements and attributes, script URLs, HTML comment
  tokens, undeclared `data-event` literals, 64 KB) and compiles it with
  sucrase. Every problem comes back at once, with its line and column.
- `PresentationRealm.make` and `PresentationRealm.layer`: renders a checked
  module to HTML in a QuickJS realm loaded with a presentation bundle, over the
  harness's `QuickJSVariant`. `render` and `interact` are bounded by time,
  interpreter steps, memory, stack, HTML, state and props; a crossed bound
  fails as `RealmError` with reason `limit_exceeded` and reloads the realm.
- `Presentation.install` and `Presentation.make`: the realm half of a
  presentation bundle. Its element constructors refuse what the checker
  refuses, and it freezes everything reachable from the realm's global.
- `ViewCsp.frameDocument`, `ViewCsp.policy`, `ViewCsp.hash` and
  `ViewCsp.sandbox`: the frame's document, pinned to its runtime's hash.
- `Bridge`: the four frame messages as schemas, `Bridge.receive` (decoding,
  bounds, declared events, ten interactions a second) and
  `Bridge.acceptInitialize`.
- `Interactions`: declared events, and the `data-event` attribute's
  `parse` and `format`.
- `realm.limit_hit`, a counter of crossed bounds by limit.
- Content-free failures: `PresentationRealm.render` and
  `PresentationRealm.interact` spans end through `SpanFailure` from
  `@smthrs/flow`, with only `realm.reason` and `realm.limit` attributes.
  `RealmError.message` names only the reason and the limit; what the module
  threw, which can quote its props, state or event, is in the redacted
  `RealmError.detail`. `ViewCodeError.message` names only the reason; the
  problems, which quote the module, are in the redacted
  `ViewCodeError.detail` and `ViewCodeError.problems`.
