---
"@smthrs/views": minor
---

`Docs` reads a docs site's `llms.txt` index: `Docs.parse` answers its title, summary and pages on the index's own origin, `Docs.find` and `Docs.search` find pages by path and by the words of a query, and `Docs.fetchText` fetches the index or a page from a server through the guard `WebPage.check` uses. `Home.read` reads a home's `docs`, the `https` URL of its docs index (`Home.DocsUrl`).
