---
"@smthrs/repo-view": minor
---

Adds the live editors: `CodeEditor`, a file's text in CodeMirror that several people edit at once, with their carets and
selections, and `LiveMarkdownEditor`, `MarkdownEditor` over a shared document. Both report each edit with the text it
was made on, and take an outside value without echoing it. Adds `@codemirror/commands`, `@codemirror/state` and
`@codemirror/view` at the versions `@smthrs/ui` already uses.
