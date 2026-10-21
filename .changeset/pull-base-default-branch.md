---
"@smthrs/integrations": minor
---

`GitHub.Pulls.PullRequest`'s `base` is now `GitHub.Pulls.PullBase`: its branch
and commit, plus `repo.default_branch`, the base repository's default branch as
GitHub answers it. `repo` decodes as `null` when GitHub's answer leaves it out.
