# Organization host

A local host that runs an agent organization (`Org/` from
`@smthrs/organization`) against your repositories: requests arrive from the
CLI or one Slack app, roles work in microVMs, and approved changes land on
`organization/…` branches with receipts under `Org/Runs/`. It is the native
control plane and gateway (`/rpc`, `/projections`, `/health`) on loopback,
with durable SQLite state; runs survive a restart.

## Commands

```sh
node flows/organization/cli.ts init ~/org                 # setup/: writes Org/ and ~/.smithers/org/.env
node flows/organization/cli.ts doctor                     # setup/: checks everything below
node flows/organization/cli.ts serve --standalone         # the host, foreground; Ctrl-C stops it
node flows/organization/cli.ts submit "<task>" --wait     # start a request, wait, print its receipt
node flows/organization/cli.ts status [--write]           # runs and open gates; --write rewrites Org/Status.md
node flows/organization/cli.ts answer <gate> approve      # or decline; --run <id> when several wait
```

`serve` without `--standalone` refuses: the backend-supervised mode is not
built yet. Client commands talk to `127.0.0.1:7433` (`--port`,
`SMITHERS_ORG_PORT`).

## Configuration

Flags override variables, variables override the state directory's `.env`
(the setup commands read the same names):

| Setting | Flag | Variable | Default |
| --- | --- | --- | --- |
| Directory holding `Org/` | `--root` | `SMITHERS_ORG_ROOT` | current directory |
| State (databases, `.env`) | `--state-dir` | `SMITHERS_ORG_STATE_DIR` | `~/.smithers/org` |
| Repositories | `--repo name=path` (repeat) | `SMITHERS_ORG_REPOS` (comma-separated) | required |
| Checks run on every change | `--check name=command` (repeat) | `SMITHERS_ORG_CHECKS` (one per line) | none |
| Builder/checker rounds | `--max-rounds` | `SMITHERS_ORG_MAX_ROUNDS` | 2 |
| Concurrent microVMs | | `SMITHERS_ORG_MAX_CONCURRENT_VMS` | `vm.maxConcurrentVMs` |
| Slack | | `SMITHERS_SLACK_BOT_TOKEN`, `SMITHERS_SLACK_APP_TOKEN`, `SMITHERS_SLACK_TEAM_IDS`, `SMITHERS_SLACK_USER_IDS` | off |

A repository is named as the roster's `grants.repositories` name it. A bare
path is named by its `origin` remote's `owner/name`, else its directory name;
use `name=path` when that differs. Seats resolve from the environment
(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `SMITHERS_OPENAI_AUTH=chatgpt`).
With `judge: none` role results are checked by the flow, not by a judge.

## Flows

- `organization/intake` — admits a request (a Slack author must be in
  `SMITHERS_SLACK_USER_IDS`; the repository must be configured), says "On it."
  in a Slack thread as the assistant, and starts delivery. A request key
  (`slack:<team>:<event>` or `cli:<key>`) deduplicates: the same key joins the
  run it started.
- `organization/deliver` — assistant routes → the role it hands to writes a
  contract naming a builder and a checker → the builder works in a microVM
  workspace → the diff is collected → checks run in a fresh microVM → the
  checker decides, for at most `--max-rounds` rounds → the change lands on
  `organization/<key>-<hash>` (never the checked-out branch, never pushed) →
  receipt → thread reply. Every principal a role names is re-resolved against
  the pinned roster, so an inactive one is refused. It is registered but not
  listed: only intake starts it.
- `organization/status` — rewrites `wiki.statusFile` from the receipts.

Gates from `Org/Policy/Gates.md` attach at two boundaries; an empty policy adds
no node:

| Boundary | Target | Subject |
| --- | --- | --- |
| `task` | `organization/deliver` | request text and assignment |
| `external-write` | `organization/apply-change` | patch digest, files, branch, checks |

An Approval gate parks the run until `answer <gate> approve|decline`, or an
owner's button press in the request's Slack thread (the host posts the prompt
there). A Review gate runs the reviewer's role task.

## Restart and machines

Parked runs resume after a restart. Machines carry this installation's owner
label and this process's holder label; at startup the host removes machines
whose holder process is gone, so a workspace in use when the host stopped is
lost: a run resumed in the middle of a build gets a new, empty machine, and
its diff collection fails the run. A run parked at a gate has already
collected its diff and is unaffected. The roster is pinned at startup: a run
pinned to a roster revision the restarted host no longer has is refused, never
run against the new one.

## Command registry

`cli.ts` exports `registry`, a map from name to `Command`
(`{ name, usage, run(argv, io) => Promise<exitCode> }`, from
`setup/settings.ts`). `setup/index.ts` exports `commands`; each is registered
by name beside `serve`, `submit`, `status`, and `answer`. To add one, add it to
that array.

## Tests

```sh
node --test flows/test/organization-host.test.mjs        # land, duplicate, gate + restart, retired, forged
node --test flows/test/organization-host-slack.test.mjs  # DM, thread replies, buttons
```

Both run the host in a separate process with scripted seats
(`testing/scripted-host.ts`; the builder edits with `bash`) and real microVMs,
and skip by name where none can boot. Targets: `//flows:organizationHost`,
`//flows:organizationSetup`.
