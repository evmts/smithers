---
"@smthrs/cli": minor
---

`smthrs open` no longer starts a Smithers checkout's development build. That build was the old app (`apps/app`),
removed on 2026-10-21. On macOS it opens the installed Smithers app; elsewhere it prints the smithers.sh page.
`commands/Open` drops the `smithersRepo` and `smithersHosts` exports and the `"dev"` outcome.
