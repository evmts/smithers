---
"@smthrs/ui": minor
---

`<Markdown>` renders a line that is only `![alt](src)` as a framed screenshot when you pass `resolveImage`, which maps the source to its light and dark files; the variant matching `html[data-theme]` shows. Without a resolver, or when it returns `undefined`, the block renders its alt text. Inline images render as their alt text instead of a `!` and a link.
