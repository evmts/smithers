---
"@smthrs/platform-browser": minor
---

Add `BrowserRuntime.run({ authorize })`, typed `BrowserRuntime.Authorize`: a
check on the app's shared database that runs each time a worker is about to
lead, before the engine is built, unfinished work resumes, or tabs can read
shared SQLite. A failure ends the activation as an engine that cannot be built
does; a transaction the check leaves open is rolled back before anything else
runs. Unlike `prepare`, it is never cached as done, so an app can check device
ownership on every activation.
