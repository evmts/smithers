---
"@smthrs/integrations": minor
---

Adds what stacked pull requests need: `GitHub.Pulls.setBase(owner, repo, number, base)` moves a pull request onto
another base branch, `GitHub.Pulls.markReady(owner, repo, nodeId)` takes a draft out of draft through GraphQL
`markPullRequestReadyForReview`, and `GitHub.Commits.mergeInto(owner, repo, { base, head, commitMessage? })` merges a
branch or commit into a branch (`POST /merges`), answering `merged` with the merge commit or `upToDate`. All three are
safe to repeat, so a lost answer fails `retryable`.
