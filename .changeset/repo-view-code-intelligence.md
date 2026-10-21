---
"@smthrs/repo-view": minor
---

Show a language server's help on code, as GitHub's code view does.

- `CodeFileView` gains `marks` (symbol highlights, and problems as a wavy underline with a bar in the gutter), `cursor` (a keyboard cursor the arrow keys move through the symbols pierre drew, through `onCursorMove`), `hover` (a card under its token with a signature, a body and problems), `onTokenSelect` (a plain click) and `onKeyDown`. `codeMarksCss`, `moveCursor` and `isSymbolText` are the rules underneath.
- `RepoView` passes `code` (`RepoViewCode`) to the shown file's code view.
- `SymbolsPane`: a symbol's definitions and references grouped by file, or a file's filterable outline, every row a link to its line, with ↑, ↓ and Escape.
