---
title: "Show a repository home"
description: "Draw the blocks a repository declares in .smithers/home.json with RepositoryHome: text, links, Markdown files, a prompt and app buttons, read with Home.read from @smthrs/views."
---

A repository declares its home in `.smithers/home.json`. `Home.read` from
`@smthrs/views` checks the file and answers its blocks. `RepositoryHome` draws
those blocks. A home is data: the component runs nothing on arrival, and a
button acts only when a person presses it.

```tsx
import { Home } from "@smthrs/views"
import { RepositoryHome } from "@smthrs/ui"

const home = Home.read(homeJsonText)

{home._tag === "Declared" ? (
  <RepositoryHome
    aria-label="maya/tinyhttp home"
    blocks={home.blocks}
    files={{ "README.md": { state: "text", text: readme } }}
    askHref="/maya/tinyhttp?ask=1"
    onAsk={(flow) => router.navigate({ to: "/maya/tinyhttp", search: { ask: 1, flow } })}
    offered={(flow) => catalog.has(flow)}
  />
) : null}
```

When `Home.read` answers `Invalid`, show the file tree with one line, such as
`Home is invalid`. When no block draws, `RepositoryHome` renders nothing, so
show the tree then too.

## What each block draws

Each drawn block is a `div` with `data-slot="repository-home-block"` and
`data-kind` set to the block's `type`. A block's `title`, when present, is an
`<h2>`.

| Block | Draws |
| --- | --- |
| `text` | Its text in a paragraph, line breaks kept. Always text, never markup. |
| `links` | A list of links that open in a new tab with `rel="noopener noreferrer"`. A URL that isn't absolute `http` or `https` is not drawn. |
| `markdown` | The file at `path` from `files`, as a document. |
| `prompt` | A link styled as an outline button to `askHref`, labelled by `placeholder`, or `Ask Smithers`. |
| `app` | A link styled as an outline button to `askHref`, labelled by `title`, with `data-picture` set to its picture. Adjacent app blocks share one wrapping row. |
| `flows`, `stack`, `view` | Nothing yet. |

`flows`, `stack` and `view` need rows the page doesn't have in this release:
the repository's flow catalog, its stack of changes, and a flow's view in the
presentation realm.

## Props

| Prop | Meaning |
| --- | --- |
| `blocks` | The declared blocks, in order, as `Home.read` answered them. |
| `files` | Each markdown block's file by its repository path: `{ state: "loading" }`, `{ state: "text", text }` or `{ state: "failed" }`. |
| `askHref` | Where a prompt or app button goes. Without it, prompt and app blocks aren't drawn. |
| `onAsk` | Called on a plain click on a prompt or app button, with the block's `flow`, or `undefined` for a prompt without one. The click's default is prevented, so your router navigates. Without it, the buttons are plain links. |
| `offered` | Whether this page has an app block's flow. Without it, no app block is drawn. |

Other props go to the `<section>` (`data-slot="repository-home"`).

## Markdown files

`RepositoryHome` reads no file itself. Read each markdown block's `path` at
the home's commit and pass what you have in `files`:

- A path missing from `files`, or `loading`, shows a spinner named
  `Loading <path>`.
- `text` renders with `Markdown variant="document"`.
- `failed` shows one status line, `Couldn't read <path>`.

## Keyboard

Every prompt and app button and every listed link is a real link, so Tab
reaches it and Enter follows it. With `onAsk`, a plain click or Enter calls it
instead of following the link. A click with ⌘, Ctrl, Shift or Alt, or with the
middle button, keeps the browser's own behavior, such as opening a new tab, and
doesn't call `onAsk`.

## Related

- [API reference](../api.md#repository-home): the props and exports.
- [Show a run](./show-a-run.md): the run pages a home's flows lead to.
