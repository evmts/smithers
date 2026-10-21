---
"@smthrs/platform-browser": minor
---

Add BrowserRuntime.authorize(database), checked on every activation before the engine is constructed, unfinished work resumes, or tabs can read shared SQLite. Refusal ends activation; any transaction left by the check is rolled back before proceeding. This enables account isolation without caching a prior identity check in a migration receipt.
