# Production CI e2e is pushed by the App installation

Date: 2026-10-23. Implements the lead's production CI test decision.

On deployments, `e2e/ci.spec.ts` mints a repository-scoped installation token with the existing `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY`. The App installation creates the scratch branch and commit through REST. The test waits for GitHub's real push delivery, correlating the commit SHA and repository in ChatApi's `ci.dispatch` records, then follows that delivery's run. It never self-signs on a deployment.

Local development retains the person token and self-signed webhook. Both paths declare their prerequisites, watch the run and verify `smithers/ci` on the commit. `@smthrs/integrations` from the library catalog supplies App authentication, REST and credential scrubbing; GitHub HTTP runs outside Playwright's request recorder. The token, JWT and key never enter a browser, trace or attachment.

This changes the test harness only, with no plugin interface, product behavior or public SDK API change. Production execution and GIF receipts belong to the deployer.
