# Plugins

Like webpack, the app is a core of primitives plus plugins, and our own features are plugins on the same public interface anyone uses (ruling PLUGIN-1, [decision 0017](../decisions/0017-everything-is-a-plugin.md)). This page is the host as built: slice 1, with the queue ([decision 0022](../decisions/0022-review-queue.md), slice 1) as its first plugin.

## A plugin

A built-in plugin is a folder in `apps/mvp/plugins/<id>/`:

```
plugins/queue/
  plugin.json              the manifest: data, read without running plugin code
  src/tab.ts               `tab`: an Effect from PluginHost to { queries, actions }
  src/components/*.tsx     React over { queries, actions }; the names its `component` renders name
```

`plugin.json` is decoded and checked by `@smthrs/plugin`'s `Manifest` and `Load` ([library catalog](../../../../docs/libraries.md)). It declares the flows the plugin borrows (`uses`), its capability ceiling (`capabilities`), and what it contributes. The core names a plugin in one place, `src/plugins/builtin.ts`; deleting the folder and that line removes the feature. A plugin imports only `@smthrs/*` roots, `react`, `@tanstack/react-db`, `effect` and its own folder.

## Loading

```
boot ─ Plugins.layer ─ Load.load(hostFacts, BUILTIN manifests)
         │  decode · requires.api · order · check against the catalog ─▶ contributions | refusals
         ▼
       plugin.load span + smithers_plugin_loads per plugin; smithers_plugin_contributions by point
use    a slot draws · a view opens · a key or command fires ─▶ the plugin's chunks load, its tab is built once
```

- **The host's points.** This host implements `views`, `slots`, `commands` and `keybindings` (with view events). A manifest using any other point is refused `unsupported_point`; nothing it declares is silently ignored (`src/plugins/contract.ts`).
- **A refused plugin never blocks boot.** It is logged as `plugin.refused` with its reason and the field (`contributes.keybindings[2].event`), and the rest load. A component that throws, or a chunk that fails, shows one line naming the plugin, and the shell stays (`Boundary.tsx`).
- **Lazy.** No component, tab or flow body loads at boot. A plugin's tab is built on first use, in the host's scope, from `PluginHost` alone.

## The host contract

`PluginHost` (`@smthrs/plugin`) is the one contract a plugin's tab reads and acts through; the app implements it per plugin (`src/plugins/plugins.ts`, `hostFor`):

| Member | What it does here |
|---|---|
| `query(name)` | The rows of a declared query, live: `core/waits` is the viewer's open waits, oldest first (from the synced `runs`, [agent status](agent-status.md)). |
| `select(item)` | The row the person is looking at; the strip under every view of the plugin that reads its query acts on it. A key that isn't a row is refused `not_in_reads`. |
| `propose(event, fields)` | Prefills the strip's note from a strip event's text field. Nothing runs until the person presses. |
| `dispatch(event, fields)` | Runs an event whose flow isn't person-only, door `view`. |
| `open(view)` | Navigates to one of the plugin's views (`app/navigate`). |
| `events(view)` | The view's local events the keymap delivered (`j`, `k`). |

## The action strip

Under a plugin's view, in host UI (`ActionStrip.tsx`, `src/plugins/strip.ts`): one button per person-only event whose key's `when` holds for the selected item. An event that picks one of the item's choices (`$item.options[$event.index]`) is one button per choice, keyed `1` to `9`. One text box fills every text field (a note); `i` focuses it and `Esc` leaves it. A note belongs to its item: it is kept on the device per view and item (`plugin-drafts`, src/device/registry.ts), so a reload keeps it and it never rides with another item, and it is dropped once its answer went. A button acts only on the item it was drawn for: if that item moved on meanwhile (answered on another device, a new version), the press does nothing (`stale`). While a press is on its way the strip shows `Sending` and further presses do nothing, so two presses record one answer; a failed press shows `Not sent`, keeps the note, and the next press retries. A view's keys are its own bindings: another plugin's binding of an event with the same name never changes this strip.

## Keys

`src/plugins/keymap.ts` is the one judge of plugins' keybindings: two-stroke keys (`g q`, within 1 s), `digit`, `mod+enter` (⌘ on a Mac, Ctrl elsewhere), and the `when` grammar (`view == <id>`, `item.<field>`, `focus.input`, `!`, `&&`). A key with no modifier never fires while the person types in a field. A command runs its flow with door `key`; a person-only event presses the strip; a local event goes to its view.

## Views, slots and commands

- **Views** show at `/app/<plugin>/<path>` full size (`PluginScreen.tsx`), with the strip under them. A person below the view's `minimum` sees the page's header alone. Inline views in the conversation come later.
- **Slots** are named places the shell draws: `shell.nav` holds the queue's count beside Flows, Runs and Settings.
- **Commands** with a `slash` join the composer's menu, running their flow with the payload the manifest fixes: `/queue` runs `app/navigate` to `/app/queue`.

## The queue

The first plugin (`plugins/queue/`): everything that waits on you, one item at a time, oldest first, full screen, by keyboard. `g q` or `/queue` opens it; `j` and `k` move; the strip answers: `1`–`9` picks an option, `a` approves and `r` asks for changes (each with the note), `⌘↵` sends the note as a reply. Its only wiring is its manifest and `PluginHost`; it never dispatches `run/answer` itself.

## Observability

`plugin.load` (a span and log line per plugin: id, version, tier, outcome, reason), `smithers_plugin_loads`, `smithers_plugin_contributions` by point, `plugin.press` and `smithers_plugin_presses` (plugin, event, door, outcome: `done`, `failed`, `invalid`, `stale`), `plugin.key` and `smithers_plugin_keys`, and `flow.dispatch` with door `key`. None carries a manifest's text, an item or a note ([observability](../observability.md)).

## Tests

- `@smthrs/plugin`'s suite: the manifest, the checks and every refusal reason, the binding, `when` and key grammars, fuzzed decoding.
- `src/plugins/*.test.ts`: the app's manifests load with no refusal; `PluginHost` scoping and its refusals; the strip and the keymap over a real device (`src/test/chatApi.ts`).
- `plugins/queue/src/tab.test.ts`: the queue over real waits, answered through the strip, on a real device.
- `e2e/queue.spec.ts`: the agent asks three times; `g q`; `2`, `j`, a note and `a`, `1`; every asking run goes on. With a GIF.
