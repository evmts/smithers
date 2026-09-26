# Quickstart: a local organization

Runs on one macOS (Apple silicon) or Linux/KVM machine. Every agent command
runs in a Microsandbox microVM.

## 1. Install

```sh
git clone https://github.com/smithersai/smithers && cd smithers
pnpm install
cargo +1.98.0 build --release --locked -p smithers-ffi --bin smithers-jj-export
```

Node must be at least `.node-version`. `doctor` pulls the VM image
(`node:26-bookworm`) when it is not cached.

## 2. Create the organization

```sh
node flows/organization/setup/cli.ts init ~/org
```

`~/org/Org` starts as the four-role example. `init` also writes
`Org/Setup/.env.example`, `Org/Setup/slack-app-manifest.yaml`, and
`~/.smithers/org/.env` (mode 600). Running `init` on an existing `Org/` only
validates it.

## 3. Keys and repository

Edit `~/.smithers/org/.env`: the model key for your seats (for example
`OPENAI_API_KEY`) and `SMITHERS_ORG_REPOS=<path to a git checkout>`.

## 4. Slack (optional)

1. <https://api.slack.com/apps> → **Create New App** → **From a manifest** →
   paste `Org/Setup/slack-app-manifest.yaml`.
2. **Basic Information → App-Level Tokens** → generate one with
   `connections:write` → `SMITHERS_SLACK_APP_TOKEN` (`xapp-…`).
3. **Install App** → install → `SMITHERS_SLACK_BOT_TOKEN` (`xoxb-…`).
4. `SMITHERS_SLACK_USER_IDS`: your profile → ⋮ → **Copy member ID**.
5. `SMITHERS_SLACK_TEAM_IDS`: run `doctor`; it prints the team id `auth.test`
   returned.

## 5. Check

```sh
node flows/organization/setup/cli.ts doctor
```

Each line is `PASS`, `SKIP`, or `FAIL` with its fix. The exit code is 0 only
when nothing fails. Slack lines are `SKIP` until both tokens are set.

## 6. Run

```sh
# pending the organization host (flows/organization serve)
```

Then DM the app a small task.
