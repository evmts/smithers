---
"@smthrs/ui": patch
---

`Markdown` draws a heading, whether `#` Markdown or an `<h1>`-`<h6>` in a document's HTML, with `role="heading"` and
its `aria-level`, so assistive technology and `getByRole("heading")` find it; it looks the same as before.
