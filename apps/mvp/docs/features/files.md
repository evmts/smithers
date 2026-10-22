# File tabs

The files open in a repository show as tabs above its code, and the agent opens a file there, with lines highlighted, to show the person code (Will's feature 4, rulings SCOPE-6: "open files and highlight lines of code for the user. Files themselves should show up as tabs"). A person and the agent use the same two flows, `file/open` and `file/close` (FLOW-3).

## What a person sees

```
┌ octocat/Spoon-Knife ─────────────────────────────────────────────┐
│ README.md  × │ index.html  × │ styles.css  × │                   │  ← the strip; the file on screen underlined
├──────────────────────────────────────────────────────────────────┤
│  1  <!DOCTYPE html>                                              │
│  2  <html>                     ← ?L=2-3 highlighted               │
│  3  <head>                                                       │
```

- **Every file the code view shows gets a tab**, however it opened: a click in the file tree, the address bar, `app/navigate`, or `file/open`. A directory adds none. Nothing shows until a file is open.
- **The strip is per repository and revision**: a branch, tag or commit has its own. Tabs stay in the order they opened.
- **A tab remembers its lines.** Clicking it opens the file with the lines it last highlighted.
- **Closing the file on screen** shows the tab after it, else the one before, else the repository's root. Closing another tab moves nothing.
- **Keyboard:** Tab reaches the strip at the file on screen; ← and → (Home, End) move between tabs; Enter or Space opens one; Delete or Backspace closes it and focuses the tab taking its place. A ⌘, Ctrl or middle click opens the file in a new browser tab.
- **Per device.** The tabs are kept on the device, so every browser tab of the device shows the same strip and a reload keeps it; they never sync to another device or person (decision 0004 Q3: "open tabs and scroll position stay per device"). The highlighted lines are in the URL (`?L=`), so a shared link shows them.

The strip shows on a file's page and on a branch's directory pages, in its workspace too.

## The flows

| Flow | Payload | Answers | Fails |
|---|---|---|---|
| `file/open` | `{ path, lines? }`: the file from the repository's root; `lines` `"12"` or `"10-20"` | `{ repository, ref, path, lines, opened }` | `NotInRepository` |
| `file/close` | `{ path }` | `{ closed }`: `false` when the file had no tab | `NotInRepository` |

Both are client flows the agent may run (`modelInvocable`), each one step that asks the tab whose request started the run, over the engine's files channel (`<engine>/files`), as [`app/navigate`](flows.md#navigation) does ([the tab that asked](flows.md#the-tab-that-asked)). That tab answers from where it is: the repository and revision of the page it shows (`hereOf`: the router's `pathname` and the repository view's resolved revision). A tab on no repository page (`/app`, a run, the settings) answers none, and the step fails `NotInRepository`; the agent then opens the page with `app/navigate`. A tab that closed answers nothing, and the step settles with `opened` or `closed` `false` after 5 s (`FILES_WITHIN`).

The strip's click and Enter dispatch `file/open` (door `button`) with the tab's remembered lines; its × and Delete dispatch `file/close`. The agent's call runs the same declarations from its cell, for "show me where the theme is set" or "highlight lines 10 to 20 of src/app.ts".

```
strip click / agent cell ─▶ FlowDispatch ─▶ engine worker: file/open/go ─▶ files channel ─▶ the tab that asked
                                                                                            FilesStore.keep
                                                                                            router.navigate(blob?L=)
the route opens the file ─▶ RepoStore view row ─▶ FilesStore's follower keeps the tab, with its lines
```

## In the code

`src/features/files/`, laid out as [state.md](../state.md) says:

| File | What it holds |
|---|---|
| `contract.ts` | the wait, the line pattern, the outcomes, the channel's name, the telemetry names |
| `schema.ts` | the `file-tabs` row (`FileTabRow`), the payloads and answers, the channel's call and reply |
| `flows.ts` | `file/open`, `file/close`, their steps, `FileTabsTabs` (the steps' side of the channel) |
| `store.ts` | `FilesStore`: the persisted `file-tabs` collection (device registry, decision 0021), its live query, `keep` and `drop` one write at a time, and the follower of the repository view |
| `actions.ts` | `FilesPage` (where the tab is, and the router's navigate), the tab's `open` and `close`, and the strip's `openTab` and `closeTab` dispatches |
| `tab.ts` | the tab's side of the channel |
| `view.ts` | the strip, the links and where a tab is, as pure functions |
| `files.ts` | `Files`: the query and actions for frontends |
| `components/` | `FileTabsBar` (over `@smthrs/ui`'s `FileTabs`) and its context |

**Why not a plugin yet.** Decision 0017 makes every feature a plugin on the public plugin interface, but the interface isn't built: `@smthrs/plugin` has no `Manifest`, `Load` or `PluginHost`, and `apps/mvp/plugins/` doesn't exist (checked 2026-10-21). So file tabs are built in the app, in one folder whose only entries into the core are the registry's two lines, its layer in `src/boot.ts`, its provider in `src/main.tsx` and the strip in the two repository screens: what a `plugin.json` would declare as two flows and one slot contribution once the host lands.

## Observability

Each step logs `files.tab` (Warn for `no_repository`), records a span of the same name and counts `smithers_web_file_tabs`, all with `op` (`open`, `close`), `door` (`button`, `agent`, or `unknown` when the tab is gone) and `outcome` (`opened`, `closed`, `absent`, `no_repository`, `gone`). None carries a path. The agent's call is also its own `execute_tool file/open` span.

## Tests

- `src/features/files/files.test.ts`: the strip and links; a tab on RepoApi's real handler and Electric (`src/test/repoDevice.ts`) keeping a tab for every file its view shows; `file/open` and `file/close` through the tab's dispatch, as the strip and as the agent, with closing on and off screen, a tab on no repository and refused payloads; a step whose tab is gone.
- `packages/smithers/ui/tests/file-tabs.test.tsx`: the strip's roles, clicks and keys.
- `e2e/files.spec.ts`: the agent opens a file at a line range in the branch workspace, the tab and highlight show; the person switches and closes tabs by keyboard.
- `evals/cases.ts` `files-show-lines`: asked to show code, the agent calls `file/open` with the lines.
