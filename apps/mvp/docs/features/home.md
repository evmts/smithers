# A repository's home

A repository declares its own home, the page `/$owner/$repo` shows instead of its file tree, in `.smithers/home.json` on its default branch. The home is data, never code: blocks of a closed set of kinds that the app draws itself, and nothing runs when the page opens. The tree is one tab away, and `/tree/` and `/blob/` links open what they name. A repository without a home opens on its tree, as before. Will, 2026-10-20: "ability to create a repositories own home view is important." Decision: [0014](../decisions/0014-flows-authoring-debugging-and-home-view.md) §4; spec M-45.

```
/$owner/$repo ─ loader ─▶ repo.openRoute (the tree, as before)
                       └▶ home.open ─ the repository ready on this device (Electric) ─▶ its head commit
                            ├ homes has <repoId>@<sha>: drawn at once (a home at a commit never changes)
                            └ GET /api/repos/<o>/<n>/blob/<sha>/.smithers/home.json ─▶ Home.read (@smthrs/views)
                                 declared ─▶ each Markdown block's file, GET …/blob/<sha>/<path>
page:  declared, with blocks ─▶ [Home] [Code] and RepositoryHome (@smthrs/ui)
       absent, no blocks     ─▶ the tree
       invalid, unreadable   ─▶ the tree under "Home is invalid" or "Couldn't read home"
```

## Making a home

Commit `.smithers/home.json` to the default branch:

```json
{
  "blocks": [
    { "type": "prompt", "title": "What should we work on?", "placeholder": "Ask Smithers…" },
    { "type": "text", "title": "About", "text": "A small HTTP server." },
    { "type": "links", "links": [{ "label": "Docs", "url": "https://example.com/docs" }] },
    { "type": "markdown", "path": "docs/intro.md", "title": "Intro" },
    { "type": "app", "flow": "flow.new", "title": "Make a flow", "picture": "wiki" }
  ]
}
```

The home shows once the app has the commit: after the clone, or once the repository's mirror syncs that commit. `@smthrs/views`' [Read a repository's home](../../../../packages/smithers/ui/views/docs/read-a-home.md) lists every field and bound. `.smithers/FACTORY.ts` can also project the file with `@smthrs/targets`' `Smithers.Factory.Home`.

| Block | What the page draws |
|---|---|
| `text` | a paragraph of plain text |
| `links` | links to `http` or `https` pages, each in a new tab |
| `markdown` | the repository's Markdown file at the same commit, or `Couldn't read <path>` |
| `prompt` | its title and a button, `placeholder` or `Ask Smithers`, that opens the default branch's workspace with its composer open |
| `app` | a button that opens the workspace with `/<flow> ` in the composer, shown only when the composer has that command (`COMMANDS`, `src/features/commands/catalog.ts`) |
| `flows`, `stack`, `view` | nothing yet: the repository's flows (`flow_bindings`), its stack and a flow's own view in the presentation realm come later |

A block of a kind the app doesn't know is skipped and counted (`skipped`). A file over 32 blocks, a block of a known kind that breaks its bounds (HTML in a string, a link that isn't `http` or `https`, a path that leaves the repository), a binary file, one over RepoApi's 512 KiB, or text that isn't JSON makes the home invalid: the page shows the tree under `Home is invalid`, never half a home.

## The page

- **Routes** (`src/router.tsx`): `/$owner/$repo` renders `RepoHomeScreen` (`src/screens/repo/RepoHomeScreen.tsx`), whose loader calls `repo.actions.openRoute` and `home.actions.open`. The blob and raw routes open the home too, for the tabs. The tree route, `/$owner/$repo/tree/$ref/$`, is the branch workspace ([branch-workspace.md](branch-workspace.md)) and its own Code and Terminal views.
- **Tabs** (`HomeTabs`): `Home` (`/$owner/$repo`) and `Code` (`/$owner/$repo/tree/<default branch>`, the first segment of a branch named with a `/` as `$ref` and the rest as the splat), with `aria-current="page"` on the one shown. Only a repository whose home shows has them. The repository's name in the header links to `/$owner/$repo` on every repository page.
- **While the home is read** the page shows nothing under the header and tabs. Before the repository is ready on this device, it is the tree's page, which says why (`Not found`, cloning, `Sign in to clone`).
- **A prompt or app button** is a real link to the default branch's workspace. A plain click navigates in the app and, once the workspace opens, opens its composer; for an app block or a prompt naming a command the composer has, it starts the composer with `/<flow> ` (`draftFor`, `src/features/home/view.ts`). A modified click opens the link as the browser does.

## The browser

`src/features/home/`, framework-free logic beside React views ([state.md](../state.md)).

| Piece | What it is |
|---|---|
| `homes` | persisted collection (`Collection.persisted`, schema version 1), keyed `<repoId>@<sha>`: `declared` with its blocks and `skipped`, `absent`, `invalid` with its reason, or `unreadable`. A home at a commit never changes, so it is read once and kept on the device; `unreadable` is read again on the next open |
| `home-files` | local, keyed `<homeKey>:<path>`: each Markdown block's file, `loading`, `text` or `failed`; a failed one is read again on the next open |
| `home-current` | local, one row: the routed repository, its home's key once the repository is ready, and its default branch |
| `open(owner, name)` | the loaders' action: names the repository at once (another page of the same repository keeps the home it shows), then in the store's scope waits for the repository to be ready (`ready`, `src/features/repo/actions.ts`), reads its home at the head through `RepoClient`, then each Markdown block's file. Opening another repository interrupts a wait |
| `homePageOf`, `tabsOf`, `offered`, `draftFor`, `filesOf` | pure: what the page shows from the rows (`view.ts`) |

Reading a home runs no flow: it is a read at an immutable commit, which RepoApi and the browser's HTTP cache keep (`Cache-Control: immutable`), and it changes nothing. The libraries are `@smthrs/views` (`Home.read`), `@smthrs/ui` (`RepositoryHome`), `@smthrs/effect-tanstack-db` (`Collection.persisted`, `Collection.local`, `LiveQuery`) and the repository feature's `RepoClient` over Effect `HttpClient` ([libraries](../../../../docs/libraries.md)).

## Observability

| Record | Kind | Fields |
|---|---|---|
| `home.resolve` | log and span; Warn `unreadable` | `outcome` (`declared`, `absent`, `invalid`, `unreadable`, `cached`), `blocks`, `skipped`, `reason`, `status`, `durationMs` |
| `home.file.load` | log; Warn `failed` | `outcome`, `status`, `durationMs` |
| `smithers_web_home_resolves` | counter | `outcome` |

No record carries a block, a title, a text, a path, a link or a file's contents ([observability.md](../observability.md#a-repositorys-home)).

## Tests

| Test | Proves |
|---|---|
| `src/features/home/home.test.ts` | on a tab against RepoApi's real handler, the compose Postgres and Electric, and the scripted Code Storage: a declared home's blocks, skipped kinds, its Markdown files read once each at the same commit and a missing one read again on the next open, the tabs and the workspace link; the home kept on the device and not read again; a default branch named with a `/`; no home, an empty home; each invalid reason (`json`, `block`, `blocks`, `binary`, `too_large`); Code Storage down as `unreadable`, read again on the next open; the wait for a repository that isn't ready, interrupted by another; a name GitHub couldn't have; every record, and a sentinel in no log line |
| `src/features/home/view.test.ts` | what the page shows from each row, encoded links, the tabs, the composer's command, the files |
| `packages/smithers/ui/views/test/Home*.test.ts` | `Home.read`: every block and bound, HTML refused, unknown kinds skipped, this repository's `.smithers/home.json`, fuzzing with kept counterexamples, and agreement with `@smthrs/targets`' writer |
| `packages/smithers/ui/tests/repository-home.test.tsx` | `RepositoryHome`: every kind, files' states, links, the ask links' plain and modified clicks, offered app blocks |
| `e2e/home.spec.ts` | in a real browser on `smithersai/home-fixture`: the home draws its blocks (an unknown kind and an app the composer hasn't skipped), survives a reload, Code opens the tree, a file opens by its URL with the tabs, Home comes back, and the prompt and an app block open the workspace's composer, the app block's command in it; `octocat/Spoon-Knife` opens on its tree with no tabs. It skips locally without `CODE_STORAGE_*` |

## Not built yet

- Editing the home from the app (`repo/home/edit`, decision 0014 §2), which needs the pull-request flow of decision 0012.
- `flows` (the repository's active flows, `flow_bindings`), `stack` (TODOs) and `view` (a flow's `view.tsx` through `@smthrs/views`' presentation realm and `GeneratedView`, decision 0014 L3).
- A home benchmark (decision 0014 §8, "a home's first paint").
