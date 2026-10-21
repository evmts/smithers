---
"@smthrs/ui": minor
---

Adds `RepositoryHome`, which draws the home a repository declares in `.smithers/home.json`, as `Home.read` from
`@smthrs/views` answers it (sections and the newer blocks: `ui-repository-home-sections`).

- `text` is a paragraph, always text; `links` open in a new tab with `rel="noopener noreferrer"`, absolute `http` and
  `https` only; `markdown` shows the host's read of its file: a named spinner, the document, or `Couldn't read <path>`.
- `prompt` and `app` blocks are real links to `askHref` styled as outline buttons. With `onAsk`, a plain click prevents
  its default and calls `onAsk(flow)`, so the host's router navigates; a modified click keeps the browser's behavior.
  An app block draws only when `offered(flow)` is true, and adjacent app blocks share one row.
- A `view` block is not drawn yet. When no block draws, the component renders nothing.
