# Change your code with a flow

Run a coding agent on your subscription, inspect its changes, then commit and push them yourself. Smithers does not review or land this change. You review the diff and tests and push with your own tools. A [person-only local landing route](https://github.com/smithersai/smithers/issues/4261) is planned.

## Install

Use Node 26.4.0 or later and install jj as described in [Installation](../installation.md).

```bash
npm install -g smthrs@next
smthrs --version
```

The tested prerelease printed `1.0.0-rc.14`. The coding walkthrough passed after a retry for [#4283](https://github.com/smithersai/smithers/issues/4283). Another attempt failed with [#4284](https://github.com/smithersai/smithers/issues/4284). Resuming after a process kill failed with `plan_changed`; see [#4268](https://github.com/smithersai/smithers/issues/4268).

## Create a project

```bash
mkdir slug
cd slug
printf '{"name":"slug","type":"module","scripts":{"test":"node --test"}}\n' > package.json
printf 'export const name = "slug"\n' > index.js
jj git init .
jj config set --repo user.name 'Docs Test User'
jj config set --repo user.email docs@example.invalid
jj describe -m 'Initial tiny project'
jj new
```

Use your own name and email. For an existing project, start in its directory instead. If you use Git, replace the jj commands above with:

```bash
git init -b main
git config user.name 'Docs Test User'
git config user.email docs@example.invalid
git add .
git commit -m 'Initial tiny project'
```

Smithers uses jj to show changes, including in Git projects. In a Git project, also run `jj git init --colocate .` before continuing.

## Choose your subscription

```bash
smthrs generate flow coding
```

Open `.smithers/flows/coding/flow.ts`. Set both `seat` and `model` to `"openai:gpt-6.1-sol"` for Codex, or `"opus"` for Claude. Keep credentials out of the file.

For an existing Codex login:

```bash
export SMITHERS_OPENAI_AUTH=chatgpt
unset ANTHROPIC_API_KEY OPENAI_API_KEY AI_GATEWAY_API_KEY
```

If you have not connected a subscription, follow [Installation](../installation.md#requirements) first. The Codex path below was tested on a Pro subscription. The Claude alternative was not tested in this walkthrough.

## Ask for the change

```bash
smthrs flow start coding --data '{"args":"Add an exported slugify(text) function to index.js with tests in index.test.js using node:test and node:assert/strict. Lowercase text, replace spaces with hyphens, remove punctuation, trim hyphens. Actually write code and tests, run node --test. Do not commit, approve, merge, land or move main."}'
```

Trimmed output from the subscription run:

```text
_tag: Accepted
receiptId: "approve:plan-2"
runId: run-2
```

Use the run id printed by your command:

```bash
smthrs runs show run-2
```

Trimmed output:

```text
runId: run-2
flowId: coding
status: completed
```

Continue only after `status: completed`. If it failed or parked, inspect the diagnosis in `runs show` and follow [Diagnose a run](./diagnose-a-run.md).

### If the run stops

If the process running the flow dies, `smthrs runs show <id>` shows the saved run.
Use `smthrs runs resume <id>` to request continuation of the same run; the tested prerelease failed this check as noted above.
See [Diagnose a run](./diagnose-a-run.md).

## Review and test

```bash
smthrs change diff
node --test
```

The recorded diff included `Modified regular file index.js` and `Added regular file index.test.js`. The test output ended with:

```text
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

Read the whole diff, including generated flow files. Check that the tests cover the behavior you requested. Your agent may produce different code and a different test count.

## Commit and push yourself

Configure `origin` for your repository if it is not already set. With jj:

```bash
jj git remote add origin /path/to/your/origin.git
jj describe -m 'Add slugify'
jj bookmark set main -r @
jj new
jj git push --remote origin --bookmark main --allow-new
```

With Git, use these commands instead:

```bash
git remote add origin /path/to/your/origin.git
git add .
git commit -m 'Add slugify'
git push -u origin main
```

Replace the example remote path with your own remote. Skip `remote add` when `origin` already exists. Follow your repository's branch and pull request policy when it requires review before main.
