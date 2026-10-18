---
title: Web first, desktop app later
status: done
area: design
owner: Will (decided 2026-10-19)
updated: 2026-10-19
links: [../decisions/0010-web-first-desktop-later.md, ../state.md, host-agnostic-flows.md, ../decisions/0011-the-agent-runs-in-the-browser.md, pwa.md, durable-browser-engine.md]
---

## What

The app ships on the web. A downloadable desktop app (Electrobun) comes when the first feature must run on the person's own machine, for example local flows with file access, local CLI agents, or a repo's own tooling. Until then such a feature is designed but not shipped.

## Why

Will: "we should support web and donwloadable so the decision I want you to record is we are using web until we encounter a feature that has to be local only and then we will add support for electrobun."

## State

- Decision 0010 is accepted.
- The code stays portable: the framework-free state machine and Effect services take platform code from injected hosts, `@smthrs/platform-browser` today.
- Root `AGENTS.md` still lists Electrobun desktop distribution among MVP removals, which stays true until the triggering feature.
- 22:22 on 2026-10-19: Will, on design question 0003.1: "our native app version later will just run the cloudflare code locally". Flow code now takes Cloudflare only as injected layers, enforced by lint, so the desktop app can run the same flows on the Bun or Node host ([host-agnostic flows](host-agnostic-flows.md)).
- 22:29: Will: "The app should be a pwa to go along with it's local-firstness btw". 22:31: decision [0011](../decisions/0011-the-agent-runs-in-the-browser.md) makes the web app an installable [PWA](pwa.md) and runs the agent in the browser on the [durable browser engine](durable-browser-engine.md). Its §6: the native app later runs the identical agent and flows; only the host layers change.

## Next

None now. The triggering feature's decision record adds Electrobun.

## Questions for Will

None.
