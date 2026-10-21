# VibeLang grammar

`VibeLang.tmLanguage.json` is a copy of VibeLang's TextMate grammar,
`editors/vscode/syntaxes/VibeLang.tmLanguage.json` in effeck/effeck. VibeLang's
`editors/vscode/scripts/derive-grammar.mjs` derives it from
microsoft/TypeScript-TmLanguage (MIT; the JSON records the upstream revision),
and `ThirdPartyNotices.txt` is that project's notice. To refresh, copy both
files from effeck/effeck. The JSDoc injection grammar is not included.

`../vibe.ts` registers it for `.vibe` files, and for `.effeck` files from before the
rename, and loads it lazily, on the first VibeLang file.
