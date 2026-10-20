---
title: Browser-safe root for @smthrs/integrations
status: done
area: sdk
owner: integrations agent (started 23:01 on 2026-10-19; reported done 23:27); its follow-up is [Effect HttpClient](integrations-effect-httpclient.md)
updated: 2026-10-19
links: [../decisions/0006-repo-clone-and-view.md, ../../../../docs/libraries.md, ../../../../AGENTS.md, repo-clone-and-view.md, code-storage-spend-caps.md, platform-cloudflare-edge-cache.md, code-reviews.md, host-agnostic-flows.md, web-standard-globals-rule.md, integrations-effect-httpclient.md, gitremote-unicode-branches.md]
---

## What

Make `@smthrs/integrations`' root entry import and run in a browser and a Cloudflare Worker. Today it imports `node:crypto` in three files: `src/core/Pkce.ts` (`createHash`, `randomBytes`), `src/core/Signature.ts` (`createHmac`) and `src/github/Proxy.ts` (`timingSafeEqual`). Move them to WebCrypto, or to an injected service from the host packages.

## Why

`repo/Inspect` reads a GitHub repository's size before import through `GitHub.GitHubClient` (decision 0006, "Capacity and spend"), and that step runs on the Cloudflare host. Root `AGENTS.md`: every library except the host packages must run in a browser, a Worker, Node and Bun, and "a package that breaks this has a bug". `docs/libraries.md` lists the package under "Known violations: the root entry reaches platform code". It is the second of two SDK pieces, besides W5, before feature 2's backend (R3).

## State

- 2026-10-19, about 22:02: the [spend caps](code-storage-spend-caps.md) design named it as an R3 prerequisite.
- 22:06: the lead told Will the clone flow needs "a browser-safe root for `@smthrs/integrations`" first.
- Not started. The three `node:crypto` imports are still there.
- 23:01: **started.** The lead's brief, test first:
  1. find every Node or host import reachable from `src/index.ts`;
  2. move host-specific parts behind injected services: Effect `HttpClient` for any Node HTTP, WebCrypto for webhook verification and OAuth PKCE, and anything truly host-bound to the matching `@smthrs/platform-*` package as a layer;
  3. update every consumer (`apps/app` is a likely one) to provide the new layers;
  4. add the package to `packages/repo-targets/browser/browser-contract.mjs` and pass the browser bundle gate;
  5. change its `docs/libraries.md` rows from "violation" to "All".
  - It may not edit `platform-browser` (B1), `apps/mvp` or `packages/smithers/ui`; it reports any layer `platform-browser` needs instead.
- 23:07: its first file: `packages/smithers/agent/integrations/test/BrowserBundle.test.ts`, the failing bundle test. The three `node:crypto` imports are still in `src`.
- 23:01: [Codex checkpoint review 2](code-reviews.md) found the same class of defect in `@smthrs/effect-code-storage`: token signing calls ambient `globalThis.crypto.subtle` instead of an injected service ([repo clone and view](repo-clone-and-view.md)). This agent's brief says to use WebCrypto; the lead hasn't reconciled the two at 23:07. (Reconciled by 23:12, below.)
- By 23:12: **the lead ruled that a library calling WebCrypto meets the rule**: web-standard globals that all four runtimes ship aren't platform code ([web-standard globals](web-standard-globals-rule.md)). This agent was told; its brief stands.
- 23:15: no `node:` import is left in `src`. `src/core/Pkce.ts`, `src/github/Proxy.ts`, `src/core/Signature.ts` and `src/core/Channel.ts` changed by 23:10, with `Signature.test.ts`, `WebhookChannel.test.ts`, `SharedBoundaries.test.ts`, `Examples.test.ts` and `examples/github-webhook.ts`. No report yet.

- 23:14 to 23:18, on disk, unreported; nothing changed after 23:18:
  - `src/core/Signature.ts`, `test/Signature.test.ts`, `test/BrowserBundle.test.ts` and `vitest.config.ts` changed again (23:14).
  - Docs: `README.md`, `docs/concepts/control-plane.md` and `docs/api.md` (23:15).
  - **Brief step 4:** `packages/repo-targets/browser/browser-contract.mjs` lists the `@smthrs/integrations` root (changed 23:16).
  - **Brief step 5:** `docs/libraries.md` (23:18) gives the package's row "All", and the package is gone from "Known violations: the root entry reaches platform code".
  - Step 3: no consumer file outside the package changed. Only package manifests (`packages/smithers/package.json` and the package's own) depend on it, so there may be nothing to update.
  - The work looks finished on disk. Status stays in progress until the report shows the gates pass.

- 23:27: **done, reported.**
  - WebCrypto replaces `node:crypto`, and `Buffer` and `process.env` are gone from the root. A sandboxed bundle test runs the root with only web globals.
  - 100% coverage. The package is in the browser contract and off the catalog's "Known violations" list.
  - **A security bug, found and fixed.** `Core.Channel.make`'s `verify` treated any truthy value as verified, so a verifier that returned an Effect accepted forged webhook deliveries. The bundled `examples/github-webhook.ts` had the same bug. Now only `true` verifies, and a failure or defect refuses the delivery.
  - `.changeset/integrations-web-standard-root.md` records a major change: `Core.Signature.verifySignature`, `Core.Signature.computeHmacSha256Hex`, `Core.Pkce.deriveCodeChallenge` and `Core.Pkce.createPkcePair` now return Effects, and `Environment.ambientEnvironment()` is `{}` on a host without a process environment.
- 23:28: the lead told Will, and named the follow-up: the package moves from `fetch` to Effect's `HttpClient`, keeping its rule never to follow a redirect while carrying a token ([Effect HttpClient](integrations-effect-httpclient.md)).

- 23:40: **the `1.0.0-rc.15` question is answered: the webhook bug never shipped.** In the published package, `Channel.make`'s `verify` was typed `=> boolean` and `verifySignature` was synchronous, so no published verifier could return an Effect. The truthy-Effect bug existed only in the uncommitted change, and it was fixed before anything shipped. The lead told Will it "was caught before it shipped". No prerelease needs to carry a fix for it.

## Next

Nothing here. The [Effect HttpClient](integrations-effect-httpclient.md) move follows. Feature 2's R3 no longer waits on this item ([repo clone and view](repo-clone-and-view.md)).

Until 23:27 the next step was: the agent's report: 100% coverage, typecheck, lint, each touched package's and consumer's tests, the browser contract, `pnpm docs:sync` and `pnpm docs:check`.

Until 23:01 the next step was: test first, a browser-bundle contract case for the package's root, then replace the three imports, keep 100% coverage, and remove the row from the catalog's known violations. It doesn't wait on W1 or W5.

## Questions for Will

None. Open for the lead: does calling WebCrypto from a library meet the host-service rule, or must signing come through an injected service, as Codex review 2 says for `@smthrs/effect-code-storage`? (Settled by 23:12: WebCrypto meets it; see [web-standard globals](web-standard-globals-rule.md).)
- Open for the lead: does the published `1.0.0-rc.15` carry the webhook `verify` bug? If it does, the next prerelease carries the fix; nothing on record says which. (Answered 23:40: no. The published `verify` was typed `=> boolean` and `verifySignature` was synchronous; the bug existed only in the uncommitted change.)
