---
"@smthrs/targets": minor
---

The home file's format has one copy: `Home`'s constants, field schemas and block schemas (`Title`, `Url`,
`TextBlock`, `Block`, …) are now `@smthrs/views`' own, which `@smthrs/targets` depends on. `Smithers.Factory.Home`
accepts every block `@smthrs/views` reads, the landing page's and the live ones included, and writes a one-section
home.
