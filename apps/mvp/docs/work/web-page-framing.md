---
title: Web pages that refuse framing show as a card
status: done
area: web-pages
owner: web-page framing builder
updated: 2026-10-20
links: [../features/web-pages.md, ../../../../packages/smithers/ui/views/docs/check-a-web-page.md]
---

## What

Will, 2026-10-20, about 18:18, on the web page walkthrough: "This is good some web pages don't allow us to embed as an iframe and we should gracefully handle that".

`app/web/open` now asks ChatApi to check a page before it is framed (`app/web/preview`, `POST /api/web/preview`, `@smthrs/views`' `WebPage.check`). A page that allows framing shows in the chat; one that refuses, or can't be checked, is a card with its title, description, domain, icon and **Open in new tab** (Enter). The agent hears `shown: "card"` and `framing`. Docs: [web pages](../features/web-pages.md#before-a-page-is-framed).

## State

Built, with docs and changesets (`views-web-page-check`, `ui-web-page-preview`). Passing: `@smthrs/views` 199 tests at 100% coverage on the mini; `@smthrs/ui` web-page tests (81); `worker/WebPreview.test.ts` (7), `src/features/views/views.test.ts` (7), `worker/Views.test.ts` (13), `src/features/branch/conversation.test.ts` (16); `src/features/web/web.test.ts` (17, again at 23:05 once NodeHost stopped overriding an injected fetch); `pnpm docs:check`; `smthrs docs //packages/smithers/ui/views:docs`; import rules.

## Follow-ups (todo)

1. **Run the two agent cases** of `e2e/web-page.spec.ts` on the MacBook with the real model. The person's cases passed on the mini at 23:34 (5 of 5, GIFs checked: the framed page and the card both render).
2. **The MacBook's dev server** trusts the dev certificate only after a restart with the new `pnpm dev` (`NODE_EXTRA_CA_CERTS`), and only for an openssl certificate; its current mkcert certificate needs mkcert's CA. Until then the e2e's "allows framing" case shows a card there.
