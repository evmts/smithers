# 0082: Repository flows require a rollout allowlist

Date: 2026-10-23. Implements Will's CI-spine rollout requirement.

`REPO_FLOWS` admits GitHub trigger dispatch. Dispatch may start repository flows only when `REPO_FLOWS_REPOSITORIES`, an Effect Config containing comma-separated `owner/name` values, includes the repository. Names are trimmed and case-insensitive; absent or blank configuration permits none. Invalid entries authorize nothing.

`triggers/Match` checks before GitHub reads and persists `not_allowed` with no flows, also emitting its log and metric. `triggers/Start` checks again before recording or launching repository runs and emits a visible skip when the captured deployment set denies the repository. Both steps use the set read during program construction; configuration changes take effect on deployment (decision 0088). Installation access and the unrelated GitHub write allowlist do not grant this permission.

The legacy factory format (`summary`, `flows`, `on`, `github`) is not a plugin trigger manifest. The exact smithersai/smithers factory from main `eeb01ea499d0` is a committed parser fixture; it yields no triggers for pushes or pull requests. No implicit format migration runs repository code.

Tests: `worker/ci/Dispatch.test.ts` and `worker/ci/Triggers.test.ts`. Configuration: [CI](../features/ci.md#repository-rollout-allowlist).
