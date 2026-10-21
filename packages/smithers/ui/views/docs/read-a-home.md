---
title: "Read a repository's home"
description: "The blocks a repository declares in .smithers/home.json, how Home.read reads them where the home is shown, and what it refuses."
---

A repository declares its own home, the page that replaces its file tree, in
`.smithers/home.json` on its default branch. The home is data, never code: a
list of blocks of a closed set of kinds, every string bounded and free of
HTML. A page reads the file at a commit with `Home.read` and draws the blocks
itself, for example with `RepositoryHome` from `@smthrs/ui`. Nothing in the
file runs, and a button a block names runs only when a person presses it.

```json
{
  "blocks": [
    { "type": "prompt", "title": "What should we work on?", "placeholder": "Ask Smithers…" },
    { "type": "links", "links": [{ "label": "Docs", "url": "https://example.com/docs" }] },
    { "type": "markdown", "path": "docs/intro.md", "title": "Intro" },
    { "type": "app", "flow": "flow.new", "title": "Make a flow", "picture": "wiki" }
  ]
}
```

## Blocks

| `type`     | Fields                              | What a page draws                                            |
| ---------- | ----------------------------------- | ------------------------------------------------------------ |
| `text`     | `title?`, `text`                    | a paragraph of plain text                                    |
| `links`    | `title?`, `links: [{ label, url }]` | links to absolute `http` or `https` URLs                     |
| `markdown` | `path`, `title?`                    | a Markdown file of the repository, read at the home's commit |
| `prompt`   | `flow?`, `title?`, `placeholder?`   | the way to ask, with the flow that takes the question        |
| `app`      | `flow`, `title`, `picture`          | one flow's button, when the page has that flow               |
| `flows`    | `title?`                            | the repository's flows, from the page's own catalog          |
| `stack`    | `title?`                            | the repository's live stack of changes                       |
| `view`     | `flow`                              | the view a repository flow declares                          |

`picture` is `issue`, `review`, `wiki` or `schedule`. `flow` is a lowercase
name with `.` or `/` between its parts, such as `flow.new` or
`release/notes`.

## Reading

```ts
import { Home } from "@smthrs/views"

const home = Home.read(text)
if (home._tag === "Declared") draw(home.blocks)
else showTheTree(home.reason)
```

`Home.read(text)` never throws. It answers:

- `{ _tag: "Declared", blocks, skipped }`: the blocks to draw, in order. A
  block whose `type` is a string this reader doesn't know is skipped and
  counted in `skipped`, so a home a newer page declares still shows here.
  Fields a block doesn't declare are dropped. A home may declare no blocks.
- `{ _tag: "Invalid", reason }`, and the page shows the tree:
  - `json`: the text is not JSON;
  - `shape`: it is not an object with a `blocks` array;
  - `blocks`: it declares more than 32 blocks, unknown kinds included;
  - `block`: a block of a known kind breaks its bounds. One broken block makes
    the whole home invalid, so a page never draws half a home.

## Bounds

| What                    | Bound                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Blocks                  | 32 (`maximumBlocks`)                                                                                       |
| A title or a link label | 1 to 120 characters, one line (`maximumTitleLength`)                                                       |
| A text block            | 1 to 4,096 characters (`maximumTextLength`)                                                                |
| A link                  | `http://` or `https://`, no spaces or quotes, 2,048 characters (`maximumUrlLength`)                        |
| A Markdown path         | relative, no empty, `.` or `..` segment, no `\`, `%`, `:`, `?`, `#` or control character, 1,024 characters |
| Every string            | no HTML: no tag, closing tag, comment or processing instruction (`htmlPattern`); `a < b` is fine           |

## Who writes the file

A person commits it, or `@smthrs/targets` projects it from
`.smithers/FACTORY.ts` (`Smithers.Factory.Home` and the `Smithers.Home`
constructors). `@smthrs/targets` is published and this package is private, so
the writer keeps its own copy of the block schema; `test/HomeTargets.test.ts`
reads back every block the writer accepts and refuses what it refuses.
