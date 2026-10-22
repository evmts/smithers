---
title: Serve the new app at smithers.sh and preserve docs
status: in-progress
area: infra
owner: Opus smithers.sh cutover builder assigned by lead
updated: 2026-10-21 23:14 PDT
links: [legacy-smithers-sh.md, land-to-main.md, production-github-app-setup.md, production-e2e.md, prelaunch-vibelang-on-smithers.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 23:14 PDT

**What:** Serve the new app at smithers.sh with docs and working redirects.

**Why:** The public hostname must serve the current product.

**Current state:** At 23:06 e90cc1cf is deployed and smoke-tested, including www redirect and GitHub return to smithers.sh. At 23:03 the www route cleanup still awaited the next landing/deploy batch; the smoke alone does not establish that cleanup landed. Full E2E remains running.

**Next step:** Confirm www cleanup landing and route removal, then retain final redirect smoke and production acceptance receipts.

**Open questions for Will:** None newly required.

Evidence: user text and lead replies extracted by script from session 6253ecf2, approximately 21:14–23:14 PDT; tool payloads and automated notifications excluded. The supplied continuation transcript path is absent; recent continuation-era replies are in the original file. Rulings and queue answers take precedence over older docs and surviving briefs. Wiped scratch files are not missing work. Product receipts are lead-reported; this refresh validates the site build. Codex curates documentation and retains execution ownership.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 23:04 PDT

**What:** Serve the app at smithers.sh while preserving docs and redirects.

**Why:** Use the public address for the current product.

**Current state:** At 23:03 the lead says the www redirect fix is first in the next landing batch. Its builder then removes the old www route, deploys and smokes, after the production E2E builder deploys current main. The 21:26 hostname cutover and 111 preserved docs/changelog URLs remain proven; the earlier redirect smoke does not complete this remaining route cleanup.

**Next step:** Land the www fix, coordinate the two deployments and retain redirect smoke and production acceptance receipts.

**Open questions for Will:** None newly required.

Evidence: script-filtered user-typed text and lead replies, approximately 21:04–23:04 PDT. Both requested transcript paths checked; continuation text is present in 6253ecf2, while the supplied 265921d3 path is absent. Current rulings and queue answers govern; surviving briefs and reports inform history. Reboot-wiped files are not unfinished work. Codex owns this tracker reconciliation; implementation ownership above is retained. Product results are lead-reported; this refresh runs the site build.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 22:53 PDT

**What:** Serve apps/mvp at smithers.sh while preserving public docs and redirects.

**Why:** Make the public address serve the current app.

**Current state:** The hostname cutover deployed at 21:26. At 21:38 the lead reports all 111 old sitemap docs/changelog URLs resolving and www redirecting to smithers.sh; HTTP/1.1 deploy transport is automatic. At 22:42 signed-in production tests pass 12 of 13: GitHub sign-in, real chat, landing and docs work. Offline sign-in followed by reopening loses branch navigation on both smithers.sh and workers.dev; track C owns the failure. This is not a complete production acceptance pass.

**Next step:** Collect the remaining redirect landing receipt, fix offline branch navigation and rerun production acceptance after the next batch deploy.

**Open questions for Will:** None newly required.

Evidence: script-filtered user-typed messages and lead text replies over the latest approximately two hours, through 22:53 PDT, in session 6253ecf2. Both requested paths were checked; the continuation path is unavailable here, while continuation-era replies are present in the original session. Current rulings and queue answers prevail over older decisions and proposals. Surviving briefs inform handoff state; reboot-wiped files are not missing work. Implementation owners are retained; Codex curates documentation. Product checks above are reported receipts, not rerun by this tracker refresh.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:44 PDT

**What:** Serve apps/mvp at smithers.sh while preserving docs.

**Why:** Make the public address serve the current app.

**Current state:** Deployed pushed main 7c4f77086cc1 at 21:26. Public smoke checks pass; all 111 old sitemap docs/changelog/legal URLs resolve. The lead confirms the cutover at 21:38. Downtime was about six minutes following an HTTP/2 deployment failure. Roughly 330 Mintlify root redirects were intentionally dropped because they collide with repository paths. Signed-in production e2e is still scheduled for about 21:57 after local DNS negative-cache expiry.

**Next step:** Collect signed-in production e2e and the Alchemy www follow-up receipt; use the standard private deployment wrapper.

**Open questions for Will:** None newly required.

Evidence: script-filtered recent human text and lead replies through 21:43 PDT in session 6253ecf2, current rulings and queue answers; surviving reports where cited. The supplied continuation path is absent; post-reboot replies are in the available transcript. Product results are reported receipts, not rerun here. Existing execution owner retained; Codex curates documentation. Wiped scratch files are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:24 PDT

**What:** Serve apps/mvp at smithers.sh while preserving docs and legal routes.

**Why:** The public hostname must serve the current app.

**Current state:** At 21:18 the lead confirms routing code landed; at 21:21 pushed main is 7c4f77086cc1. The designated builder still owns the first hostname-changing deploy. No completed cutover or production acceptance receipt appears.

**Next step:** Designated builder deploys first, then verifies sign-in, docs, PWA and production e2e. Other deployers wait for its completion receipt.

**Open questions for Will:** None; earlier callback and optional redirect requests are resolved.

Evidence: script-filtered human messages and lead text replies in the latest approximately two hours across both requested transcript paths; continuation path is absent, but continuation-era replies appear in 6253ecf2. Current rulings and queue answers prevail. Surviving briefs/reports used where cited; wiped scratch files are not missing work. Execution ownership retained; Codex curates this note. Product checks are reported receipts, not rerun here.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:16 PDT

**What:** Serve the app at smithers.sh while preserving docs and legal routes.

**Why:** The public hostname must serve the current app.

**Current state:** The cutover is implemented and tested, with f8074e65 named in the surviving deployment brief. No first-cutover completion receipt is available. Will grants the optional Single Redirect permission at 21:07, so www redirect work is authorized. The callback request was already removed.

**Next step:** Land the cutover; its designated builder performs the first deploy. Verify app, sign-in, docs and PWA routing, then the Alchemy www redirect. Future production deploys use the private configured environment.

**Open questions for Will:** None; callback and redirect permission requests are resolved.

Evidence: script-filtered human messages and lead text replies, 19:15–21:15 PDT in session 6253ecf2; current rulings, queue answers and surviving briefs/reports. The supplied continuation file was not found; continuation-era lead replies are present in 6253ecf2. Product receipts are reported evidence, not rerun here. Existing execution ownership retained; Codex curates documentation. Reboot-wiped scratch files are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 21:10 PDT

**What:** Serve the new app at smithers.sh while preserving docs and legal paths.

**Why:** The public address still serves the old app.

**Current state:** At 20:58 the lead reports code finished and tested, committing next. GitHub already redirects to smithers.sh, so the callback request was removed. No cutover/deployment receipt is reported.

**Next step:** Land and deploy the Alchemy cutover, verify docs/PWA routing and signed-in production journeys.

**Open questions for Will:** Optional www redirect permission remains separate; no callback action needed.

Evidence: script-filtered user text and lead replies, 19:06–21:06 PDT; current rulings and queue answers through 21:06; surviving briefs and reports. Product results are reported receipts, not rerun here. Implementation ownership retained; Codex curates documentation. Wiped scratch files are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 20:47 PDT

**What:** Serve apps/mvp at smithers.sh and preserve established docs URLs.

**Why:** The public address must show the current app.

**Current state:** At 20:38 the builder is implementing routing that retains docs, changelogs, legal pages and llms.txt. The lead estimates 2–3 minutes downtime and removal of about 1,300 clashing legacy redirects outside /docs. No cutover receipt appears.

**Next step:** Complete routing, restore push access, add the production callback, deploy and prove docs continuity and live sign-in.

**Open questions for Will:** Add https://smithers.sh/api/auth/callback while retaining workers.dev. Single Redirect edit permission is optional for the www redirect.

Evidence: script-filtered human text and lead replies, 18:46–20:46 PDT, session 6253ecf2; current rulings and queue answers prevail. Runner results are recovered report receipts. Codex curates this update; existing implementation ownership is retained.

## Earlier tracker history (retained)


**What:** Switch smithers.sh to apps/mvp while preserving every smithers.sh/docs link.

**Why:** The hosted app’s public address must serve the current product (SCOPE-1 and SCOPE-8).

**Current state:** At 20:29 the lead assigned an Opus builder to inspect current hosting, implement the switch, deploy and run production e2e on smithers.sh. At 20:30 it was restarted after Will’s reset. At 20:32 smithers.sh still serves the old app; the new app is at its workers.dev address. No cutover or deployment receipt exists. This is distinct from retirement of the old launch, which remains done in legacy-smithers-sh.md, and from hosting VibeLang/custom domains.

**Next step:** Finish the routing change and docs continuity check, deploy and run the real production journeys against smithers.sh. Verify the sign-in callback at the new origin.

**Open questions for Will:** None yet. If GitHub sign-in settings need a provider-side change, the assigned builder will identify the exact setting; do not presume a new permission is needed.

Evidence: script-filtered lead replies at 20:29–20:32 PDT in session 6253ecf2. Rulings and queue answers govern. Codex curates this note; the assigned builder owns execution.
