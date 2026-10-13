---
title: "Seed public mirrors"
description: "Name the public GitHub repositories a hosted deployment always serves signed out, and learn how the backend creates and follows them."
---

A public mirror is a public GitHub repository that a hosted deployment serves
to signed-out visitors under the same owner and name. The deployment names its
mirrors in configuration, and the backend creates each missing one on every start.
A mirror depends on no person's account, import or access token, so it is
present on a deployment whose database began empty and survives the removal of
the account that would otherwise have imported it.

## Configure

Set `SMITHERS_PUBLIC_MIRRORS` to a comma-separated list of `owner/repo` names:

```sh
SMITHERS_PUBLIC_MIRRORS=smithersai/smithers
```

Each GitHub repository must be public and must declare the pull policy in its
`.smithers/factory.json`:

```json
{ "github": { "mirror": "pull" } }
```

A program that composes the backend can name mirrors in code instead, with
`app.Config.PublicMirrors`. The deployment's mirrors are that list followed by
the environment's, each repository once. Smithers Cloud names its mirrors this
way, so they ship with the API image.

A malformed entry stops the backend at start. Mirrors apply to hosted
deployments only; an install refuses to start with any.

## What the seeder does

The seeder runs with the workers, at start and every five minutes. For each
mirror it holds a PostgreSQL advisory lock, so API replicas that start together
create one mirror. It creates what is missing and changes nothing that exists.

| Missing | What the seeder creates |
| --- | --- |
| An organization named `owner` | A public organization owned by the deployment's service account, `smithers-machines`. |
| A repository named `repo` in it | A public, empty repository with `main` as its default bookmark. |
| The repository's GitHub source | `https://github.com/owner/repo` as its mirror destination, and a request for the first pull. |

The service account cannot sign in and none of its tokens authenticate. An
administrator makes a person an owner of a seeded organization.

The seeder refuses a mirror, and logs `public_mirror.seed_failed`, when:

- `owner` is a user account. Users and organizations share one namespace.
- The organization is private. The signed-out catalog lists repositories of
  public organizations only.
- The repository is private. It may hold branches and workspace snapshots made
  while it was private, so the seeder never publishes it.
- The repository already follows a different GitHub repository.

Visibility is the owners' decision. Once an owner makes the organization or
repository public, the next run finds the mirror in place.

One mirror's refusal does not stop the others.

## How history arrives

The seeder writes rows only. The GitHub main pull
(`internal/services/github_main_pull.go`) moves history: it reads GitHub's
`main` every five minutes and on each push webhook, without a credential for a
public repository.

- A repository that holds no `main` yet gets it created at GitHub's tip, with
  GitHub's whole history. This is a seeded mirror's first pull.
- After that the pull fast-forwards `main` to GitHub's tip. A `main` that
  diverged from GitHub's is never overwritten; the pull records the failure.

The pull creates a missing `main` on hosted deployments only. An install's
import creates `main`.

## Check a mirror

```sh
curl https://<host>/api/public/repos
curl https://<host>/api/repos/<owner>/<repo>/bookmarks
```

The first response lists `owner/repo`. The second, sent without credentials,
lists `main` at GitHub's current commit within five minutes of a push. A
signed-in administrator reads the pull's last observation, including its error,
from `GET /api/repos/<owner>/<repo>/github/main-pull`.
