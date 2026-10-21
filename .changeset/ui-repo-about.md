---
"@smthrs/ui": minor
---

Adds `RepoAbout`, a repository's about panel as GitHub's sidebar: description, homepage, topics, stars, watchers and
forks, license, the latest release, contributors and a languages bar. Every part is optional and a missing one isn't
drawn; `loading` runs the shared `LoadingBar`. `formatCount` and `languageShares` are exported with it.

Adds `GeneratedChip`, a quiet Generated chip for a file a flow produced, which opens the flow, its last run and its
sources.

```tsx
<RepoAbout description="A tiny HTTP server" topics={["http"]} stars={14126} languages={[{ name: "TypeScript", bytes: 9990 }]} />
```
