# Backend safety

Administrator exports stream into an exclusively created `0600` file inside a
unique private staging directory beside the destination. Publication is one
atomic rename. Concurrent exports have separate staging files; the last
completed rename wins. A failed download preserves any existing archive and
removes only its own staging directory.

Stack landing reads every page of check runs and reviews before deciding.
Dismissal revokes the reviewer's prior decision; comments do not change it.
Every merge method includes the exact head SHA whose checks were read, so a
head change causes GitHub to refuse the merge. Evidence that cannot be read
completely fails closed.

The product API and command encoders reject `.` and `..` path segments before
URL normalization. OAuth callback wrappers accept code, state, and provider
error query parameters, encoding them as query data.

This repairs the existing CLI transport using the library catalog's
`@smthrs/cli` entry and existing `@smthrs/integrations` GitHub marker helpers.
The legacy direct-token and server-proxy transport choices remain at the CLI
boundary because they support both local credentials and server-held GitHub
App credentials. No new provider client or dependency is introduced.

`test/BackendSafety.test.ts` uses real files and loopback HTTP with a provided
Effect fault service. It never intercepts fetch or performs a real merge.
Run it with `pnpm --dir packages/smithers exec vitest run
test/BackendSafety.test.ts --coverage.enabled=false` and run
`pnpm exec smithers-build test '//packages/smithers:importRules'`.
