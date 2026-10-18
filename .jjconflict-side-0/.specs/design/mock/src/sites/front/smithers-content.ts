/*
 * Smithers docs content (PM S#5). smithers.sh/docs serves only Installation and the HTTP API reference; the
 * quickstart lives on GitHub. Content trimmed from apps/site/docs/installation.mdx and
 * apps/site/src/content/docs/docs/reference/http-api.mdx.
 */
import { SMITHERS_REPO } from "../core/catalog"

export interface SmithersDocPage {
  /** Route slug under smithers.sh/docs; "" is the index at smithers.sh/docs. */
  slug: string
  title: string
  /** Source path in github.com/smithersai/smithers, for "Edit this page"; null for the index. */
  file: string | null
  body: string
}

export const SMITHERS_DOCS: Array<SmithersDocPage> = [
  {
    slug: "",
    title: "Docs",
    file: null,
    body: `
Two references live here; the coding guide lives on GitHub.

## Pages

- [Installation](installation.md): install the \`smthrs\` CLI and the Mac app.
- [HTTP API reference](reference/http-api.md): the routes \`smthrs serve\` mounts, their protocols, and their authentication.
- [Coding guide on GitHub ↗](https://github.com/smithersai/smithers/blob/main/packages/smithers/docs/guides/change-code.md)

## Smithers on Smithers

[Read Smithers' own repo on Smithers](${SMITHERS_REPO}): its files, issues, and pull requests, open signed out.
`
  },
  {
    slug: "installation",
    title: "Installation",
    file: "apps/site/docs/installation.mdx",
    body: `
Smithers maintains your codebase. It turns issues into changes you review, and, when enabled, keeps the project wiki current. Flows beside your code define how.

## Install the CLI

The CLI is on npm under the \`next\` tag, which carries the 1.0 release candidates; \`latest\` still points at 0.35.0. Use Node.js 26.4.0 or later. Verify the install with \`smthrs doctor\`, which checks flow discovery, local state, the Node.js version, and provider configuration without running a flow.

## Install on your Mac

**Planned.** The Homebrew package is not released. Prepare:

- An Apple Silicon Mac running macOS 15 or later, Homebrew, and at least 44 GiB free on the state volume.
- A GitHub repository with squash merging enabled.
- A coding-model provider key or ChatGPT sign-in.

Once the package ships, run on your Mac:

\`\`\`sh
brew install smithersai/tap/smithers
\`\`\`

## Start the install

The per-user launchd agent needs no administrator authorization and will print a setup URL for the Mac and each configured public address.

| Access | Run on the Mac | Open the browser on |
| --- | --- | --- |
| Mac | \`smthrs host start\` | The Mac |
| LAN | \`smthrs host start --bind 0.0.0.0 --origin http://studio-mini.local:4000\` | The Mac or a LAN laptop |

Replace \`studio-mini.local\` with your Mac's LAN hostname. The options are \`--bind <addr>\` and \`--origin <url>\`.

## Complete setup

Open the printed setup link. The setup card guides you in this order:

1. **Address:** choose **This Mac** or a network address your teammates will use. Address comes first because the GitHub App's sign-in callback is registered to it.
2. **GitHub App:** create the App through GitHub's app-manifest flow.
3. **Owner sign-in:** sign in with GitHub through the new App to claim the install. Claiming invalidates the setup token.
4. **Repository:** choose the repository and install the App on it. Setup checks that GitHub allows squash merging; if it does not, enable squash merging on GitHub and retry.
5. **Model access:** connect the model roles. Without a fast-model key, the app agent uses the coding model.
`
  },
  {
    slug: "reference/http-api",
    title: "HTTP API reference",
    file: "apps/site/docs/reference/api/index.mdx",
    body: `
\`smthrs serve\` mounts the workspace gateway: the control plane, the served projections, and the journal read path, plus an unauthenticated health probe.

## Mounts

Every route \`GatewayServer.layer\` mounts, in the order the startup banner prints them.

| Path | Protocol | Purpose | Auth |
| --- | --- | --- | --- |
| \`/rpc\` | HTTP \`POST\` | Control RPC (\`ControlRpcs\`) | Bearer in band through \`ControlAuth\` when a credential is configured |
| \`/rpc/ws\` | WebSocket | Control RPC, including a kept-alive \`Watch\` | Bearer at the edge when a credential is configured |
| \`/projections\` | HTTP \`POST\` | Projection snapshots (\`GatewayRpcs\`) | Bearer at the edge when a credential is configured |
| \`/projections/ws\` | WebSocket | Projection subscriptions | Bearer at the edge when a credential is configured |
| \`/sync\` | HTTP \`POST\` | Journal sync (\`SyncRpcs\`) | Bearer at the edge when a credential is configured |
| \`/sync/ws\` | WebSocket | Journal sync stream | Bearer at the edge when a credential is configured |
| \`/health\` | HTTP \`GET\` | Workspace identity | None, by design |

On the loopback default no bearer credential is configured. Every request must still carry a loopback \`Host\`, and a supplied browser \`Origin\` must use HTTP(S) on \`localhost\`, \`127.0.0.1\`, or \`[::1]\`; Origin-less CLI requests remain accepted.

## Authentication

The bind rule is strict and fails closed.

- The default bind is \`127.0.0.1:3000\`. A loopback host needs no opt-in and no credential. The ingress guard rejects foreign Host values and browser origins before HTTP or WebSocket RPC handling.
- A non-loopback bind requires an explicit \`--listen\`. Without it the verb refuses: \`Refusing to bind <host>: pass --listen to serve on a non-loopback address.\`
- A non-loopback bind also requires a bearer credential, set as \`SMITHERS_TOKEN\`. Without one the verb refuses: \`Refusing to bind <host> without a bearer token: set SMITHERS_TOKEN.\`
- The server speaks plain HTTP only. For network access, terminate TLS at a trusted reverse proxy or use an encrypted tunnel so the bearer token is not sent in cleartext.

One shared bearer authenticates every mount and binds one principal. There are no users, no roles, no per-run ownership, and no scopes. \`GET /health\` is unauthenticated so a supervisor can ask which workspace a gateway belongs to.

## The RPC surface

Three RPC groups share the gateway. \`ControlRpcs\` on \`/rpc\` is ten procedures:

| Area | Procedures | Answers |
| --- | --- | --- |
| Runs | \`Plan\`, \`Run\`, \`Resume\`, \`Cancel\`, plus the \`List\` and \`Watch\` reads | A \`Receipt\` per mutation, a \`PlanCard\` from \`Plan\`, a stream of \`ControlEvent\` from \`Watch\` |
| Approvals | \`Approve\`, \`Deny\` | A \`Receipt\` |
| Steering | \`Steer\` (a durable message to the run), \`Signal\` (a durable delivery to a named wait) | A \`Receipt\` |

\`GatewayRpcs\` on \`/projections\` serves seven read models folded from the control event stream: \`workspace-runs\`, \`run-summary\`, \`run-events\`, \`transcript\`, \`run-tree\`, \`approvals\`, and \`node-output\`. A projection never claims a run and never writes. \`SyncRpcs\` on \`/sync\` is read-only journal replication.

## Health

\`GET /health\` answers the gateway's identity as JSON:

| Field | Value |
| --- | --- |
| \`workspaceHash\` | The first 16 hex characters of the SHA-256 of the resolved project root |
| \`gatewayId\` | \`cli-<pid>\` of the serving process |
| \`protocolVersion\` | \`"1"\` |
| \`version\` | The installed \`@smthrs/cli\` package version |

The response carries identity only: never a token, a run, or a path.
`
  }
]
