# 0010: Web first; a desktop app when a feature needs one

Status: accepted (Will, 2026-10-19)

## Decision

The app ships on the web. We add a downloadable desktop app (Electrobun) when a feature has to run on the person's own machine, and not before.

Both are supported targets. The web app is the only one built until that feature arrives.

## Why

Will: "We should support web and downloadable so the decision I want you to record is we are using web until we encounter a feature that has to be local only and then we will add support for electrobun." A downloadable app makes some later features easier, but none of today's features need it, and the web reaches people with no install.

## Consequences

- **Keep the code portable.**
  - The framework-free state machine, the Effect services and the SDK host packages keep platform code injectable: `@smthrs/platform-browser` today, a desktop host later.
  - No feature may assume the browser is the only place it runs.
- **What triggers the desktop app:** the first feature that must run locally.
  - Examples: running flows on the person's own machine with access to their files, local CLI agents, or running a repository's own tooling.
  - That feature's decision record adds Electrobun.
- **Until then,** a local-only feature is designed but not shipped.
- **The root `AGENTS.md`** lists "Electrobun desktop distribution" among MVP removals. This record keeps that true for now: desktop returns only with its triggering feature.
