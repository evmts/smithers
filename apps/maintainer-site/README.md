# Maintainer site

A local site for maintainers: a Work board of every workstream, a gallery of every end-to-end flow GIF, and an Obsidian-like knowledge base of the repository's docs with backlinks, a graph, an outline per note and full-text search.

```sh
pnpm --filter @smthrs/maintainer-site build   # or: node apps/maintainer-site/build.mjs
open ~/Desktop/smithers-maintainer/index.html
```

The build has no dependencies and takes well under a second. It prints the path to `index.html`, and warns about broken links, flows without a GIF, and GIFs without a test.

## What it reads

| Content | Source |
| --- | --- |
| Flows | `~/Desktop/smithers-mvp/gifs/<spec>-<test>.gif`, from `pnpm --filter @smthrs/mvp e2e:gifs`, matched to `test("…")` in `apps/mvp/e2e/<spec>.spec.ts` |
| Notes | every Markdown file under `apps/mvp/docs/`, `apps/mvp/AGENTS.md`, `AGENTS.md`, `docs/libraries.md`, `README.md` |
| Decisions on the home page | `apps/mvp/docs/decisions/*.md` and their `Status:` line |
| Work board (`#/work`) | `apps/mvp/docs/work/*.md`, one per workstream. Front matter sets `title`, `status` (idea, todo, designing, in-progress, blocked, done), `area` (app, sdk, infra, design, process), `owner`, `updated` and `links`. The board has a column per status and filters by area; the nav counts items not done. |

Set `MAINTAINER_SITE_GIFS` or `MAINTAINER_SITE_OUT` to read GIFs from or write the site to another folder.

## What it writes

`~/Desktop/smithers-maintainer/`: `index.html`, `assets/` (the client, its styles, and `data.js` with every note rendered), and `gifs/`. A rebuild replaces those and keeps `screenshots/`.

- Relative links between notes open in the site; links to other repository files open the local file; a link to a missing file is red.
- `[[name]]` links a note by path, title or file name.
- A note's front matter (`---` `key: value` lines) shows as a properties table under its title; a `links` list counts toward backlinks and the graph. The build warns about unparsable lines and a work note's unknown status or area.
- `/` focuses search. In search, ↑ and ↓ pick a result and Enter opens it. In the large GIF view, ← and → step through flows.

## Files

| File | Role |
| --- | --- |
| `build.mjs` | Reads the sources, resolves links and backlinks, writes the site |
| `markdown.mjs` | The Markdown renderer: CommonMark blocks and inlines, GFM tables, task items, strikethrough, autolinks and alerts, wikilinks, front matter; raw HTML sanitized to an allowlist |
| `client/site.js`, `client/site.css` | The page: hash routes for home, work, flows, graph, search and notes |
| `markdown.test.mjs` | Renderer tests: `pnpm --filter @smthrs/maintainer-site test` |
| `screenshots.mjs` | Opens the built site in Chromium (apps/mvp's Playwright), checks every view and fails on a console error; saves screenshots to `screenshots/` |
