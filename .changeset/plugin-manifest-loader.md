---
"@smthrs/plugin": minor
---

Adds plugin manifests: a `plugin.json` that declares views, slots, commands and keybindings as data, a loader that
folds a set of them into one `Contributions` value, and `PluginHost`, the contract a plugin's UI runs through.

- `Manifest.decode(input)` and `Manifest.parse(text)` admit a manifest as bounded, inert JSON and decode it with
  unknown fields refused, or fail with a `Refusal` naming the field (`contributes.views[0].scope`). A keybinding with
  both `command` and `event` refuses.
- `Load.load(hostFacts, candidates)` never fails: it checks `requires.api` with `Pack.checkCompatible`, refuses
  duplicate ids, orders by `requires.plugins`, and checks each plugin against the host's points, flow catalog, query
  row schemas and tier capabilities. A bad plugin is refused with a closed `Reason` and the rest load.
- `JsonSchema.resolve` admits the closed schema subset (no `pattern`, so no plugin regular expression runs), inlines
  `#/$defs/<Name>` refs, and refuses a field that would collect a secret. `JsonSchema.validate` names the first failing value.
- `Bind`, `When` and `Keys` are the closed binding, condition and key grammars a host fills and matches.
- `PluginHost` (`query`, `select`, `propose`, `dispatch`, `open`, `events`) is a `Context.Service`; `dispatch` of a
  person-only event is refused `person_only`.

```ts
const { contributions, refused } = yield* Load.load(hostFacts, [{ tier: "built-in", manifest }])
```
