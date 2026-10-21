# Code intelligence in the code view

Status: slice 1 built (2026-10-20). Mock: [mock.html](mock.html). Will's words, 2026-10-20 about 18:22: "For code it should have full lsp support and stuff and look a lot like github". The mock is [mock.html](mock.html). The work note is [code-intelligence.md](../../work/code-intelligence.md); the feature doc is [features/code-intelligence.md](../../features/code-intelligence.md).

**In one sentence:** language servers run where the code can be read without a machine (TypeScript and JavaScript, in a Web Worker in the tab) and in the branch's sandbox only when a machine is needed (other languages, installed dependencies), all behind one seam, `@smthrs/std`'s `LanguageServer`, speaking LSP, so the code view decodes one wire whatever answered.

## Where the language servers run: hybrid, browser first

| Option | For | Against |
|---|---|---|
| Browser worker only | Free, instant, offline once files are cached, works on every commit and for signed-out readers; no machine | No Rust, Go or Python servers in a browser today; no `node_modules` at a commit, so types from packages are missing |
| Sandbox only (LSP over a WebSocket) | Every language; whole-project accuracy with installed dependencies | Starts a container to hover a read-only file; costs money per reader; nothing works offline or signed out; a round trip per hover |
| **Hybrid (chosen)** | Local answers for TypeScript and JavaScript; the sandbox only for what needs a machine | Two hosts to keep honest; one seam keeps them interchangeable |

Decision [0011](../../decisions/0011-the-agent-runs-in-the-browser.md) §2 decides it: a flow runs remotely only when the local host lacks a key, a machine or an always-on presence, "never on how long it takes". TypeScript's language service is plain JavaScript, so the tab is a sufficient host for TypeScript and JavaScript; a sandbox is used only when the need is a machine:

| Request | Host | Why |
|---|---|---|
| `.ts` `.tsx` `.mts` `.cts` `.js` `.jsx` `.mjs` `.cjs` at any commit | browser worker | the language service is JavaScript; the files come from RepoApi's immutable reads |
| Any language, in a branch workspace whose box is running | sandbox (slice 4) | the box exists, has the checkout and its installed dependencies |
| Rust, Go, Python, … with no running box | none; search-based navigation (slice 5) | starting a container to hover would make reading cost money |

A project's size never moves work to the sandbox. A large project loads a bounded program in the worker, and its records say when a cap stopped a load.

## Architecture

```
tab (React view, Effect state)                      dedicated worker (lazy chunk: typescript + lib.*.d.ts)
RepoPage ── RepoView ── CodeFileView                BrowserLanguageServer.serve
   │ pointer rest, click, ⌘-click, keys               TypeScript LanguageService
   ▼                                                  over a read-only workspace at the commit
CodeIntel actions ── LanguageServer (@smthrs/std) ── postMessage {hover|definition|…} ─▶
   │                 BrowserLanguageServer.make     ◀── Read {paths} ─────────────────── needs files
   │                   answers reads with ─────────── RepoClient.blob ─▶ GET /api/repos/<o>/<n>/blob/<sha>/<path>
   │                                                  (immutable: edge cache + browser HTTP cache)
   ◀── LSP JSON (Hover, Location[], DocumentDiagnosticReport, DocumentSymbol[]) ─────────
decode (Effect Schema) → code-intel rows (local TanStack DB) → hover card, marks, Symbols pane
```

- **One seam.** `@smthrs/std`'s `LanguageServer` is the code-intelligence service the `lsp` flow already uses; `@smthrs/platform-node`'s `NodeLanguageServer` binds it to processes. Slice 1 adds the second adapter, `@smthrs/platform-browser`'s `BrowserLanguageServer`; slice 4 adds the third, over a WebSocket to the branch box. Each answers in LSP's own shapes, so the app's decoders don't change with the host.
- **Platform code stays in the host package.** The worker, its messages and the lazy start are `BrowserLanguageServer` in `@smthrs/platform-browser`. TypeScript and the `lib.*.d.ts` files are handed to `serve` by the app's worker entry, as the package already takes ZenFS and just-bash: the package has no `typescript` dependency, and a page that never opens code never loads it.
- **The worker computes; the tab reads.** The worker asks the tab for files by path; the tab reads them through `RepoClient` (RepoApi's blob route at the commit). No key leaves the server, and reads hit the immutable caches the view already fills.
- **Lazy.** The worker module, TypeScript (about 3 MB minified) and the lib files load only when a TypeScript or JavaScript file is opened. The tab's share is the feature's store, actions and components.

### The program the worker builds

- **Files.** The open file, then its import closure: relative imports, `tsconfig.json` `paths` and `baseUrl`, resolved against the commit's file list, so `fileExists` is synchronous and no request is wasted on a guess. Up to 2,000 files and 16 MiB.
- **References widen it** to every TypeScript and JavaScript file under the nearest `tsconfig.json`'s directory, within the same caps. Each answer's span records the files loaded and whether a cap stopped a load (`partial`); a file past the caps is refused with `response_too_large`. Saying so in the Symbols pane is slice 2.
- **Options.** The nearest `tsconfig.json` (with its `extends` inside the repository), else TypeScript's defaults with `allowJs` and JSX.
- **Packages.** `node_modules` is not in git, so package imports don't resolve. Diagnostics leave out the errors that follow from that (a missing module or its types, missing `@types/node` or test globals, JSX without React's types) and keep every error in the repository's own code. Slice 3 brings package types.

## The view: GitHub's code view, with a language server

Mock: [mock.html](mock.html).

```
┌ vercel / ms ───────────────────────────────────────────────────────────────────── Code ▾  Copy permalink ┐
│ main ▾  ms / src / format.test.ts                                                                         │
├────────────┬─────────────────────────────────────────────────────────┬──────────────────────────────────┤
│ Files      │ 180 lines · 8 KB      ● 1 problem   Symbols   Raw  Copy │ format                        ✕  │
│ ▾ src      │   1 │ import { describe, expect, it } from '@jest/glo…  │ Definition                       │
│   format…  │   2 │ import { ‹format› } from './index';               │  src/index.ts                    │
│   index.ts │     │ ┌──────────────────────────────────────────────┐  │  171 export function format(…    │
│ README.md  │     │ │ function format(ms: number,                  │  │ References  24                   │
│            │     │ │   options?: Options): string                 │  │  src/format.test.ts          21  │
│            │     │ │ Format the given integer as a string.        │  │    2 import { format } from …    │
│            │     │ └──────────────────────────────────────────────┘  │    9 format(500, { long: tr…     │
│            │   9 │       ‹format›(500, { long: true });              │  src/index.ts                 3  │
│            │ ▍12 │ ~~~~~~ error under its tokens, bar in the gutter  │    63 return format(value, …     │
└────────────┴─────────────────────────────────────────────────────────┴──────────────────────────────────┘
```

| Part | What it shows | Source |
|---|---|---|
| Line numbers | pierre's gutter | `CodeFileView` |
| Symbol highlights | every occurrence in this file of the selected symbol | `references`, filtered to the file |
| Hover card | the signature as code, then its documentation, then problems on that token | `hover`, `diagnostics` |
| Definition and references | the Symbols pane on the right, grouped by file, each row a line number and its text | `definition`, `references` |
| Outline | the Symbols pane with nothing selected: the file's symbols, filterable | `documentSymbols` |
| Problems | a bar in the gutter, a wavy underline under the tokens, a count in the toolbar | `diagnostics` |
| Blame | later | slice 6 |

Pointer: resting on a token shows its hover card; a click selects the symbol (highlights it and opens it in the Symbols pane, as GitHub does); ⌘-click or Ctrl-click goes to its definition.

### Keys (keyboard first)

The code takes focus like any control. Its cursor is a symbol, not a character, because the view reads code and never edits it.

| Key | Does |
|---|---|
| `Tab` | focus the code; the cursor starts at the anchored line, else at the first symbol |
| `←` `→` | previous or next symbol on the line |
| `↑` `↓` | the symbol nearest the same column on the line above or below |
| *(cursor moves)* | the hover card follows the cursor |
| `Enter`, `F12` | go to definition |
| `r`, `Shift+F12` | references in the Symbols pane |
| `F8`, `Shift+F8` | next or previous problem |
| `o` | show or hide the Symbols pane |
| `Esc` | close the hover card, then the pane |
| `↑` `↓` `Enter` in the pane | move through rows, open one |

A definition in the same file moves the cursor and the line mark; one in another file navigates to its URL (`/<owner>/<name>/blob/<sha>/<path>?L=<line>`), so Back returns, and the link is a permalink at the same commit.

## Everything is a plugin (decision 0017)

Code intelligence is the first-party `code-intel` plugin. Its manifest, once the plugin host exists:

| Contribution | Value |
|---|---|
| flows | `code/hover`, `code/definition`, `code/references`, `code/diagnostics`, `code/symbols` (slice 2: the agent's doors; each one act for a person and the agent) |
| `repo.blob` decorations | the hover card, the marks and the Symbols pane, drawn by the host from the plugin's data |
| keys | the table above, scoped `when: code.focused` |
| hook | `code/language-server`, a `select` hook keyed by file extension: the browser server taps it for TypeScript and JavaScript; a language plugin taps it with the sandbox bridge for its extensions |

The plugin host is not built yet (0017 slice 1 is `needs-you`). Until it is, the feature is one folder, `apps/mvp/src/features/code-intel/`, with one line in each central list, so the conversion is a move. The public interface gains the `repo.blob` decoration point and the `code/language-server` hook when it does.

## Observability

Content-free (OBS-5): ids, counts, durations, methods and outcomes; never a path, a symbol name, hover text or a diagnostic message.

| Record | Where |
|---|---|
| span `code.session.open`, attribute `files` | tab: a worker started for a commit |
| span `code.<act>` | tab: each hover, definition, references, problems and outline |
| metric `smithers_web_code_intel_asks{act,outcome}` | tab |
| metric `smithers_browser_language_server_requests{method,outcome}`, `smithers_browser_language_server_ms{method}` | `BrowserLanguageServer` |
| metric `smithers_browser_language_server_files` | `BrowserLanguageServer`: files the tab read for its workers |
| span `browser.language_server.<method>`, attributes `files`, `partial` | `BrowserLanguageServer`: each request |

## Slices

| # | Slice | Proves |
|---|---|---|
| 1 | TypeScript and JavaScript in a browser worker at the commit: hover, definition (same and cross-file), references, diagnostics, outline, the GitHub-like layout and keys | e2e: hover a symbol, jump to its definition, list its references |
| 2 | The agent's doors: `code/*` flows on the same `LanguageServer` (`@smthrs/std`'s `lsp` flow), answered by the tab that has the worker; results cached per commit in `ImmutableCache`; the Symbols pane says when a cap stopped the references' load | the agent answers "where is X defined" with a location, not a search |
| 3 | Package types: the repository's `package.json` and lockfile pick `.d.ts` files, fetched through RepoApi's immutable cache | no missing-module gaps in diagnostics or hovers |
| 4 | The sandbox bridge: `LanguageServer` over a WebSocket to the branch box (`ContainerSession`), for every language the box has a server for; edits sync through `sync` | Rust hover in a branch workspace |
| 5 | Search-based navigation for languages without a server, as GitHub does | definitions in a Go file with no box |
| 6 | Blame | the gutter shows each line's commit |

## Questions for Will

None. Settled here: TypeScript in the browser first (the work note's recommendation), symbols as the cursor unit, and the Symbols pane on the right as GitHub has it.
