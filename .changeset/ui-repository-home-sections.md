---
"@smthrs/ui": minor
---

`RepositoryHome` draws a home's sections at landing-page quality, and takes `sections` in place of `blocks`.

- Each section is a `<section>` with its title and, for contributors or maintainers, a `Contributors` or
  `Maintainers` label; a block's title is now an `<h3>`. It reflows by its own width.
- New blocks: `hero` (a large name, tagline, primary and secondary links, the install command with Copy),
  `code` (a figure with Copy, colored for TypeScript, JavaScript and VibeLang, beside a `hero` before it), `cards`,
  `stats` (a `<dl>`), `releases`, and `action`: a primary button that calls `onRun(flow)`, pressed by its key while the
  person isn't typing, disabled while its flow is in `running`. `prompt` is now a band.
- The live blocks draw the rows the host passes in `live` (`RepositoryHomeLive`): `issues` (four counts and the
  issues to triage and pull requests waiting), `stack` and `runs` panels, and `flows` buttons; a `{ notice }` says why
  a block has none. Rows link in the app through `onNavigate`; `onCopy` copies the host's way.
- New `LinkTabs`: a named `<nav>` whose child links draw as page tabs, the `aria-current="page"` one underlined.
