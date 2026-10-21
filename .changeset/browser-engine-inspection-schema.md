---
"@smthrs/platform-browser": minor
---

`BrowserEngine.Inspection` and `BrowserEngine.RunList`: a run read and a page of runs as schemas, the shapes `inspect`
and `list` answer. A tab that reads a run from elsewhere, such as a server inspecting its own engine, decodes the answer
with them, without loading `@smthrs/engine-store`.
