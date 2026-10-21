---
"@smthrs/platform-browser": minor
---

Add `BrowserLanguageServer`: TypeScript's language service in a dedicated worker, as `@smthrs/std`'s `LanguageServer`, over a read-only workspace whose files the tab supplies, such as a repository at a commit.

- `make({ worker, workspace: { paths, read } })` in the tab starts the worker, answers its reads and returns the `LanguageServer`; `serve({ typescript, lib })` is the worker entry. TypeScript and its lib files are arguments, so the package gains no `typescript` dependency and a page that never starts the worker never loads them.
- Answers are the Language Server Protocol's shapes: hover, definition, references, implementation, the document outline, workspace symbols and a full diagnostic report. A request loads its file's import closure; `references` widens to every script under the file's `tsconfig.json`; a workspace loads at most 2,000 files and 16 MiB.
- Diagnostics leave out the errors that only say a package is missing, since a commit holds no `node_modules`.
- New metrics `smithers_browser_language_server_requests`, `smithers_browser_language_server_ms` and `smithers_browser_language_server_files`; a span per request. The package now depends on `@smthrs/std`.
