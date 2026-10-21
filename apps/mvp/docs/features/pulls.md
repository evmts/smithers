# Pull requests

GitHub is the truth for pull requests, as for issues ([issues](issues.md)): Postgres holds a projection that only the server's GitHub flows write, and Electric syncs it to every device. A person merges, never the agent; a pull request's checks are Smithers runs on its head, never GitHub check runs (decision [0012](../decisions/0012-git-end-to-end.md) decisions 6 and 12). The `todo` run opens the pull requests ([TODOs](todos.md#the-run)).

```
GitHub ── pull_request, pull_request_review ─▶ POST /api/github/webhook ─▶ github/Apply (re-read the pull request)
                                                                               items · pulls · pull_commits · reviews
Merge (a Maintainer's own press) ─▶ POST /api/repos/<o>/<n>/writes { op: "pr/merge" } ─▶ pr/Merge
                                     recheck head, base, draft ─▶ PUT /pulls/<n>/merge { sha: head } with their token
the todo run publishes ─▶ checks/Run on the head ─▶ runs rows with the head's SHA (the Checks tab)
                                     each .smithers/checks/<name>.sh on the branch's machine · the review: one comment
GET /api/repos/<o>/<n>/compare/<base>...<head> ─▶ the files two commits differ by, kept forever
```

- **One row per pull request, beside its issue row.** A pull request is an `items` row of kind `pull` (title, body, state, author, conversation) and a `pulls` row with its head, base, draft, merge and size. `github/Apply` reads it with its commits and reviews (`worker/github/Pulls.ts`), under the same newer-than guard as an issue.
- **A person merges, bound to what they saw.** The writes route takes `pr/merge` only from a person's own session, Maintainer or Admin, never from a run credential (the agent, a flow, a frame or a sandbox; `PROTECTED_ACTS`, worker/Actor.ts). `pr/Merge` re-reads the pull request and refuses a moved head or base, a draft, or one already merged or closed, then merges with the person's own GitHub token at the head they saw, squash by default. GitHub's refusal, a required check included, is `not_mergeable`. A lost answer is read back: merged at that head is this merge.
- **Checks are Smithers runs.** `checks/Run` runs once per head. Each `.smithers/checks/<name>.sh` runs with `sh` on the attempt's branch machine, synced to the head, and the `review` check reads the diff with the `judge` role and posts one comment review as the App, never an approval. Each is a `runs` row with the head's SHA. Checks never gate the merge: GitHub's branch protection does.
- **Libraries** (`docs/libraries.md`): "Touch GitHub" (`@smthrs/integrations`: `GitHub.Pulls`, `GitHub.Refs`, `GitHub.Commits`, `GitHub.AppAuth`), `@smthrs/flow`, `@smthrs/agent` (`ModelStep` for the review), `@smthrs/sandbox` (`SandboxTools` on the branch machine), `@smthrs/effect-electric` (`ShapeProxy`).

## Who reads, who writes

| Act | Who | Token on GitHub |
|---|---|---|
| Read pull requests, their commits, reviews and checks; compare two commits | as issues: a role on the repository, or anyone once GitHub said it is public | the App's, for the compare route |
| Merge | a Maintainer or Admin, in person (`repo:merge`); never the agent | the person's own |
| The review's comment | the `review` check, for the person who committed the TODO | the App's (`smithers[bot]`), "Reviewed by Smithers for @maya" |

## Routes

`worker/github/Api.ts` and `worker/github/Compare.ts`.

| Route | Answers |
|---|---|
| `POST /api/repos/<owner>/<name>/writes` `{ writeId, op: "pr/merge", number, headSha, baseSha, method? }` | `202 { txid, writeId }` and `pr/Merge` started (`pr-merge:<writeId>`); refusals as issues' writes: `403 forbidden` for a Member, a Guest or anyone acting for the person, `401 authentication` without a session |
| `GET /api/repos/<owner>/<name>/compare/<base>...<head>` | `200 { files, truncated }`, `Cache-Control: private, max-age=31536000, immutable`; `404 not_found` (no such commits, another repository), `401`/`403` as the shapes, `503 not_configured` (no App) or `unavailable` |
| `GET /api/shapes/pulls`, `/api/shapes/pull-commits`, `/api/shapes/reviews` | the repository's rows, `PULL_COLUMNS`, `PULL_COMMIT_COLUMNS`, `REVIEW_COLUMNS` |
| `GET /api/shapes/checks` | the repository's `runs` with a commit (`CHECK_COLUMNS`): never who launched them |

## Merge

`pr/Merge { writeId }` (`worker/github/Merge.ts`): `pr/Merge/send` (1 s doubling to 15 s, 5 minutes), then `pr/Merge/give-up` settles `failed unavailable`. Its write settles `done`, or `refused` with `head_moved`, `base_moved`, `draft`, `merged`, `closed`, `not_mergeable`, `sign_in_required`, `not_found`, `invalid` or `not_allowed`. `github/Write` refuses a `pr/merge` write it is handed: only `pr/Merge` merges.

## Postgres

Migrations `0031_pulls` and `0033_pull_writes`.

| Table | | |
|---|---|---|
| `pulls` | `item_id` (`<repo_id>#<number>`), head and base refs and SHAs, `draft`, `merged`, `merged_at`, `merged_by`, `merge_sha`, `mergeable_state`, sizes | synced without the guard's times |
| `pull_commits` | `item_id`, `position`, `sha`, `headline`, `author_login`, `authored_at` | rewritten whole when the list changes |
| `reviews` | `id` (`<repo_id>/review/<GitHub id>`), `item_id`, `author_login`, `state`, `commit_sha`, `body` without the marker, `write_id` | |
| `runs.sha` | the commit a run works on | a pull request's Checks read the runs on its head |
| `github_writes` | takes `pr/merge` and the merge's refusals | |

## Observability

| Record | Kind | Fields |
|---|---|---|
| `github.merge` | log, span | `writeId`, `outcome` (`done` or the refusal), `settled`, `errorCode` |
| `smithers_pr_merges{outcome}` | counter | |
| `github.compare`, `smithers_github_compares{outcome}` | log, span, counter | `outcome`, `files` |
| `checks.script`, `checks.review`, `checks.sync`; `smithers_checks{check,outcome}` | logs, spans, counter | `repoId`, `sha`, `check`, `prNumber`, `outcome` |
| `github.apply` | log, span | as issues' (`event` `pull_request` or `pull_request_review`) |

No record carries a title, a body, a diff, a finding, a command's output or a login.

## Tests

| Test | Proves |
|---|---|
| `packages/smithers/agent/integrations/test/Pulls.test.ts` | `GitHub.Pulls`, `Refs` and `Commits` against a fake GitHub on a real socket: fenced merges and commits, adoption after a lost answer, every refusal, 100% |
| `worker/github/Merge.test.ts` | `pr/Merge` on the Node host against the scripted GitHub: as the person, each refusal, a lost answer adopted, a run again, give-up |
| `worker/github/PullsApi.test.ts` | the merge write's admission (a Maintainer only; never the agent or a flow), the pull request webhooks and Apply's projection, the compare route, the shapes |
| `worker/flows/Checks.test.ts` | script checks pass and fail, the review's one comment as the App, a lost review adopted, a failing judge, no App |

## Not built yet

- The pull request pages (`/$owner/$repo/pulls`, `/pull/$n` with Conversation, Commits, Checks and Files) and their Merge button: built, held back until their chaptered recording passes ([pull requests](../work/pull-request-list-and-tabs.md)).
- Opening a pull request by hand from a branch, Update branch and the branches page: cut by decision 0016's simplified factory.
