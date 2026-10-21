---
"@smthrs/views": minor
---

`@smthrs/views` is published, under `next` with the rest of Smithers' packages. Its `Home` is now the home file's one
format: `@smthrs/targets` writes it with these schemas.

- A home's blocks sit in sections: `{ "sections": [{ "title", "audience", "blocks" }] }`, up to 8, or a bare `blocks`
  list as one section for everyone. `audience` is `everyone` (the default), `contributor` or `maintainer`.
  `Home.read` answers `{ _tag: "Declared", sections, contributors, skipped }`, and refuses a bad section (`section`)
  or too many (`sections`).
- `Home.sees(viewer, section)`, `Home.visible(sections, viewer)` and `Home.widen(viewer, contributors)`: who sees a
  section; the sections a viewer may see; and a home's top-level `"contributors": "anyone"`, which shows its
  contributors' sections to everyone with the link.
- New declared blocks: `hero` (a name, tagline, line, up to three links, an install command and an announcement),
  `code` (an example's source, drawn as text, so `<` is allowed), `cards`, `stats`, `releases` and `action` (a flow's
  primary button and its one-letter `key`). New live blocks, which carry no rows: `issues` and `runs`, beside `flows`
  and `stack` (`Home.liveKinds`).
