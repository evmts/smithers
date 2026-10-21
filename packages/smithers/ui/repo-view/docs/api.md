---
title: "API reference"
description: "Every export of @smthrs/repo-view: RepoView, CodeFileView and its worker pool, PierreDiffView and its helpers, MarkdownEditor, and the package's style sheet."
sidebar:
  order: 1
---

Everything below is exported from the package root, `@smthrs/repo-view`. The
package has no other entry point.

Component props types follow the shape `ComponentProps<"element"> & { ... }`
where a view renders one element, so a view also accepts that element's host
attributes and handlers.

## Styles

```ts
const repoViewCss: string
const REPO_VIEW_STYLE_ATTR: "data-smithers-repo-view"
function RepoViewStyles(): JSX.Element
```

`repoViewCss` is the sheet for `RepoView`, `CodeFileView` and
`PierreDiffView`. It reads `@smthrs/ui`'s theme tokens, so the views follow
light and dark, and every class is `sui-` namespaced. In a browser each view
appends it to `<head>` once, under `REPO_VIEW_STYLE_ATTR`. Render
`<RepoViewStyles />` once near the root where effects never run, such as a
server render; a view then finds the marked sheet and adds nothing.

## Repo view

```ts
type RepoViewLocation = { kind: "tree" | "blob"; path: string; line?: number; lineEnd?: number }
type RepoViewTree =
  | { state: "loading" }
  | { state: "ready"; paths: ReadonlyArray<string>; truncated?: boolean }
  | { state: "failed"; message: ReactNode }
type RepoViewFile =
  | { state: "loading" }
  | { state: "text"; contents: string; size: number }
  | { state: "binary"; size: number }
  | { state: "too-large"; size: number }
  | { state: "failed"; message: ReactNode }
type RepoViewSize = "inline" | "full"
type RepoViewMarkdownMode = "preview" | "source"
```

`RepoView` (`RepoViewProps`) is a repository browser. It shows the file tree
beside a directory's listing and its README, or a file as code or as a
Markdown document.

- **It fetches nothing.**
  - `tree` is every file's path at the revision.
  - `file` is the file at a `blob` location.
  - `readme` (`{ path, file }`) is a directory's README, which the host
    chooses.
- **The host owns the location.** `location` says where the view is, `href`
  builds every link, and `onNavigate` takes a plain click on any of them,
  including a relative link in a Markdown document, which resolves against the
  repository as GitHub resolves it. One view therefore serves a routed page
  and a conversation.
- **`size`:** `full` (the default) puts the tree beside the content. `inline`
  drops the tree and bounds the content's height. Below 720 px of its own
  width, a `full` view drops the tree too: the view measures its container,
  not the window.
- **The tree's open directories:** `expanded` and `onToggle`. Uncontrolled,
  the view opens the location's directories as it navigates; a host that
  controls `expanded` does the same.
- **Markdown:** a file renders as a read-only WYSIWYG document by default.
  Preview and Code switch it to its source and back, through `markdownMode`
  and `onMarkdownModeChange`, controlled or not.
- **The host's slots:** `revision` leads the header, `actions` trails it,
  `summary` sits between the header and the content, and `fileActions` trails
  a file's toolbar.
- **Other props:** `codeMode` sets the code theme. `markdownEditor` passes the
  editor's `fallback` and `loadEditor` seams.
- **States:**
  - A tree or file still `loading` shows a spinner.
  - A `failed` one shows its message as an alert.
  - A location that isn't in the tree shows "Not found".
  - A binary or too-large file shows its size.

## Code view

```ts
function CodeFileView(props: CodeFileViewProps): JSX.Element
function languageForFile(name: string): string | null

const CODE_VIEW_REST_MS: 300
const CODE_VIEW_POOL_DEADLINE_MS: 15000
const currentCodeViewPool: () => CodeViewPool
const subscribeCodeViewPool: (listener: () => void) => () => void
const disposeCodeViewPool: () => void

type CodeViewMode = "light" | "dark"
type CodeViewPoolState = "off" | "starting" | "ready" | "failed"
interface CodeViewPool { readonly state: CodeViewPoolState; readonly manager: WorkerPoolManager | undefined }
```

`CodeFileView` (`CodeFileViewProps`) renders one file: `name` supplies the
grammar, `contents` the text, `line` a 1-based anchor that is marked and
scrolled into view, `lineEnd` widens the mark to the range from `line` to it,
and `mode` and `palette` override the document's theme.
`annotations` (`CodeLineAnnotation`) render under their lines, and the consumer
must memoize the array because a new one redraws the rows. `onTokenRest` fires
once per token after the pointer rests for `CODE_VIEW_REST_MS`, reporting a
`CodeTokenPosition`; `onTokenActivate` fires on ⌘-click or Ctrl-click.

`languageForFile` answers `null` when no grammar claims the name, which is the
signal to keep your own plain text. Until the highlighter paints, the component
renders a plain `<pre>`.

The views share one worker pool per page. `currentCodeViewPool` and
`subscribeCodeViewPool` read its state; `disposeCodeViewPool` releases it after
a page unmounts its code views.

## Pierre diff view

```ts
function PierreDiffView(props: PierreDiffViewProps): JSX.Element
function patchToCodeViewItems(patch: string, selectedPath?: string | null): CodeViewItem[]
function diffsThemeForMode(mode: PierreDiffMode, palette?: ResolvedPalette): DiffsThemeNames
function diffStyleForLayout(layout: PierreDiffLayout): "split" | "unified"
function normalizeDiffPath(path: string | undefined): string

type PierreDiffMode = "light" | "dark"
type PierreDiffLayout = "split" | "inline"
```

`PierreDiffView` (`PierreDiffViewProps`) renders a unified patch: `layout`
chooses side by side against unified, `selectedPath` narrows a multi-file patch
to one file, and `emptyLabel` covers an empty or unparseable patch.
`unsafeCSS` takes trusted, static host CSS for pierre's shadow surface; never
pass it repository content.

`normalizeDiffPath` decodes git's quoted, octal-escaped path form and strips a
leading `a/` or `b/`, which is why `selectedPath` compares equal across all four
spellings of a name.

Syntax token colors follow the resolved `mode` and `palette`, which default to
the document's theme and palette. `diffsThemeForMode` selects
`themeRegistry[palette].syntax.shikiLight` or `shikiDark` for light or dark mode.
Calling the helper without a palette uses `"paper"`, the registered Paper
palette. Set it explicitly on the component:

```tsx
<PierreDiffView patch={patch} palette="paper" />
```

Registered palettes select bundled Shiki themes. The view exposes no
registration prop for custom unregistered themes; those require a separate
highlighter and worker registration path.

## Markdown editor

```ts
function supportsRichTextEditing(): boolean

const markdownEditorCss: string
const MARKDOWN_EDITOR_STYLE_ATTR: string

type MarkdownEditorErrorCode = "editor-load-failed" | "editor-create-failed"
```

`MarkdownEditor` (`MarkdownEditorProps`) takes `value` as the initial document,
not a controlled value, and reports edits through `onChange`. `resetKey` forces
a re-seed when the host switches documents. `loadEditor`
(`MarkdownEditorModule`) is the injectable module loader, which is how a test or
a host with its own build drives the rich path. `escapeTabOrder` defaults to
true so Tab moves focus out rather than trapping a keyboard user. `fallback`
forces the textarea or the rich editor, overriding the
`supportsRichTextEditing` probe. `onLinkClick` receives a clicked link's
`href` as written in the markdown; returning true stops the browser from
following it, which is how a host opens a document's relative links itself.
`readOnly` shows the document without editing, and an HTML node in it shows as
its text. `MarkdownEditorHandle` exposes `getMarkdown` and the imperative seams.
Images stay inline Markdown images, so their alt text and title round-trip
unchanged. Crepe's image block is off because it saves its display ratio as
the alt text.

`MarkdownEditorStyles` ships the Crepe theme in a `<style>` element; every
editor also injects it in the browser. `MarkdownEditorError` carries a `code`
and the original `cause`; both codes are described in
[Failure codes](./reference/contracts.md).
