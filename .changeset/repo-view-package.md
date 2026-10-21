---
"@smthrs/repo-view": minor
"@smthrs/ui": major
---

Adds `@smthrs/repo-view`, the heavy views of a repository imported from one root: `RepoView`, `CodeFileView` and its
worker pool, `PierreDiffView` and its helpers, and `MarkdownEditor`. Shiki's grammars and themes, the VibeLang grammar
and Milkdown still load on first use; `test/bundle.test.ts` fails if any of them reaches the entry chunk.

- The views ship their own sheet, `repoViewCss`, which each view injects once; render `RepoViewStyles` where effects
  never run.
- The Markdown editor's layout probe removes its element even when measurement throws, and a page that refuses to
  create workers leaves highlighting on the main thread without an unhandled rejection.

`@smthrs/ui` drops the `./adapters/repo-view`, `./adapters/code-view`, `./adapters/markdown-editor` and
`./adapters/pierre-diff-view` subpaths and its `@pierre/diffs` and `@milkdown/*` dependencies; import those views from
`@smthrs/repo-view`. It is major because 0.35.0 on npm exported `./adapters/markdown-editor` and
`./adapters/pierre-diff-view`. The root gains `useResolvedTheme`, `isPlainNavigationClick` and `decodeGitPath`.
