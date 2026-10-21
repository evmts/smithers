---
"@smthrs/platform-browser": minor
---

`BrowserRuntime.run({ prepare })` runs work on the app's shared database before
the leader answers any tab's statement: `prepare.run` over the leader's own
connection, as the durable flow `device/prepare`, once per `prepare.epoch`. A
leader that dies mid-way leaves the run for the next one, which resumes it; a
preparation that keeps failing is logged as `browser.runtime.prepare` and the
leader serves the tabs anyway. `BrowserRuntime.preparations` counts them by
outcome. `@smthrs/effect-tanstack-db`'s `Migrations.prepare(registry)` is one.
