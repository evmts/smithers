---
"@smthrs/repo-view": minor
---

`RepoView` lays out a repository page as GitHub does and shows an HTML file as CodePen does.

- `aside` draws a column on the right of a `full` view, such as an about panel; it moves under the content when the
  view is narrow. `fileTree={false}` drops the tree on the left.
- A ready tree's `directories` lists folders known without their files, such as a repository's top level before a
  clone.
- `fileBadges` sits after a file's stats in its toolbar, such as a Generated chip.
- An HTML file offers Code, Preview and Split (`htmlMode`, `onHtmlModeChange`). The preview is `HtmlPreview`: a
  sandboxed frame (`allow-scripts` only, an opaque origin) whose document runs under `HTML_PREVIEW_CSP`, with no
  network; a page that navigates itself is put back on the file. `previewDocument` builds its document.

The tree's column now holds its place while the files load, so a loading view no longer draws its header and content
in the tree's 240 px column and then jumps.
