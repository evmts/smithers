---
title: Web-standard globals aren't platform code (review 2, finding 4)
status: done
area: sdk
owner: lead (smithers-b3), ruled by 23:12 on 2026-10-19; Will may overrule
updated: 2026-10-19
links: [../../../../docs/libraries.md, ../../../../AGENTS.md, code-reviews.md, integrations-browser-safe-root.md, repo-clone-and-view.md, library-catalog.md, decisions-for-will.md, integrations-effect-httpclient.md]
---

## What

A library outside the host packages may call the web-standard globals that a browser, a Cloudflare Worker, Node and Bun all ship: `fetch`, `crypto.subtle`, `crypto.getRandomValues`, `TextEncoder`, `URL`, streams and `AbortController`. Where Effect has its own service, the library prefers it (`HttpClient` for HTTP, `Crypto` for random bytes and digests), so tests can inject faults.

Platform code still lives only in `@smthrs/platform-node`, `-bun`, `-browser` and `-cloudflare`: `node:*`, `Bun.*`, the DOM, child processes, sockets and the filesystem.

## Why

[Codex checkpoint review 2](code-reviews.md), P2 finding 4, said `@smthrs/effect-code-storage` breaks the root `AGENTS.md` platform rule: its token signing calls ambient `globalThis.crypto.subtle` (`internal/token.ts:65` and `:94`). Codex asked for an injected key-import and signing service with implementations in the host packages.

The lead rejected the finding, interpreting Will's rule: `crypto.subtle` and `fetch` are built into the browser, Cloudflare Workers, Node and Bun alike, so they aren't platform code, and 13 SDK packages already use them.

## State

- By 23:12 on 2026-10-19: the lead wrote the clarification into `docs/libraries.md`'s Platform rule, in the paragraph after the host-package list. Uncommitted.
- The [integrations root](integrations-browser-safe-root.md) agent was told; its brief already said WebCrypto.
- Will was told at 23:12 and may overrule. No answer at 23:15.
- `@smthrs/effect-code-storage` keeps signing with `crypto.subtle`.

- 23:27: the integrations root shipped on WebCrypto under this ruling ([integrations root](integrations-browser-safe-root.md)). 23:28: it moves next to Effect's `HttpClient`, the ruling's preferred service for HTTP ([Effect HttpClient](integrations-effect-httpclient.md)).
- 23:37: no answer from Will.

## Next

Nothing, unless Will overrules. If he does: an injected signing service with implementations in the host packages, and `@smthrs/effect-code-storage` and `@smthrs/integrations` move onto it.

## Questions for Will

- Does the ruling stand, or must WebCrypto reach libraries as an injected service, as Codex says? Recommended: it stands. Building proceeds on it.
