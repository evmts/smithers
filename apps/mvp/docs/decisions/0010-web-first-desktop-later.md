# 0010: Web first; a desktop app when a feature needs one

Status: accepted (Will, 2026-10-19). Amended 2026-10-20: hosted only ([below](#hosted-only-will-2026-10-20)).

## Decision

The app ships on the web. We add a downloadable desktop app (Electrobun) when a feature has to run on the person's own machine, and not before.

Both are supported targets. The web app is the only one built until that feature arrives.

## Hosted only (Will, 2026-10-20)

Will, 13:31:14 on 2026-10-20: "Built for hosted only now yes cut scope in that way."

- **The app targets the hosted deployment only:** Cloudflare Workers through Alchemy, Neon Postgres, Electric and Code Storage ([infrastructure](../infrastructure.md)).
- **The self-hosted install on one Apple Silicon Mac is deferred until after ship,** not cut ([self-hosted install](../work/self-host-install.md), [TODO](../todo.md#the-self-hosted-install-after-ship)).
  - No feature needs a local Layer, a setup flow, a local git store or a local sandbox provider now.
  - Local development (`pnpm db:up`, `alchemy dev`) is not a self-hosted install.
- **Every service stays behind a Layer,** so the Mac install can later swap each hosted service for a local one, as [0011](0011-the-agent-runs-in-the-browser.md) §6 and [host-agnostic flows](../work/host-agnostic-flows.md) already require. A feature that reaches a hosted service outside its Layer is a defect.
- **M-31 answered (Will, 14:22 on 2026-10-20, [rulings](../rulings.md) SCOPE-9):** the docs follow the app being built now. Root `AGENTS.md` and `.specs/product/mvp.md` say hosted only, and M-31's dogfooding on the Mac mini install is superseded.

## Why

Will: "We should support web and downloadable so the decision I want you to record is we are using web until we encounter a feature that has to be local only and then we will add support for electrobun." A downloadable app makes some later features easier, but none of today's features need it, and the web reaches people with no install.

Hosted only: one deployment target ships sooner than two, and keeping each service behind a Layer keeps the Mac install a set of new Layers rather than a rewrite.

## Consequences

- **Keep the code portable.**
  - The framework-free state machine, the Effect services and the SDK host packages keep platform code injectable: `@smthrs/platform-browser` today, a desktop host later.
  - No feature may assume the browser is the only place it runs.
- **What triggers the desktop app:** the first feature that must run locally.
  - Examples: running flows on the person's own machine with access to their files, local CLI agents, or running a repository's own tooling.
  - That feature's decision record adds Electrobun.
- **Until then,** a local-only feature is designed but not shipped.
- **The root `AGENTS.md`** states this rule: web first, Electrobun only when a feature must run locally (SCOPE-10).
