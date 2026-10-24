# 0095: New conversations use Smithers-only refs

2026-10-23. Accepted.

Will selected option C from the [ref-location proposal](../proposals/new-branch-ref-location.md).
His words, 2026-10-23 14:09:

> We avoid interacting with gitthub as much as possible and generrally interacting with github is always explicit. But like everything everything should be a flow and customizable users if they want can write code to customize

This supersedes the GitHub-branch interpretation of [0012](0012-git-end-to-end.md)
and [0013](0013-branch-workspace.md) **for new conversations**. One conversation,
branch identity, sandbox, presence room and sharing policy still travel together.
Existing branch and conversation IDs stay unchanged. TODO publication remains an
explicit GitHub operation, with its existing authorization and attribution.

## Ref location

The default creation flow creates an ephemeral ref on the existing Code Storage
mirror, based on its ordinary default branch. It never writes an ordinary mirror
ref and never writes GitHub. A missing mirror/default branch remains a refusal;
creation never silently imports a repository or broadens credentials.

Each branch stores `ref_namespace`, `default` or `ephemeral`. Existing rows
migrate to `default`. The sandbox payload carries this location through durable
execution and reload. Sharing and
presence continue to address the existing branch UUID and access policy.

The sandbox Git proxy scopes ephemeral access to the stored branch. The SDK
advertises only that branch and HEAD, accepts only its current tip as a want,
and removes client haves before forwarding. It rejects unsupported protocol
commands and compressed or oversized requests. No private sibling ref or
arbitrary object ID becomes a fetch target. The upstream namespace suffix stays
behind the proxy; credentials never enter the sandbox.

Repository ref listings may include only ephemeral names the viewer can access.
The shared ordinary-ref cache does not include that private result. File and
tree reads remain pinned to a commit SHA; namespaces share the same Git objects.
No UI control or explanatory copy is added.

The SDK maps `namespace`/`fromNamespace` to the provider's
`target_is_ephemeral`/`base_is_ephemeral`; branch, file and commit read options
map `namespace` to `ephemeral`. Git remotes append `+ephemeral` before `.git`,
while tokens continue to name the unsuffixed repository. Verified against the
[primary OpenAPI](https://code.storage/docs/openapi.json), schema
`ReposBranchesCreateRequest`, on 2026-10-23. The
[ephemeral namespace guide](https://code.storage/docs/repos/ephemeral-branches.md)
and [GitHub sync guide](https://code.storage/docs/repos/github-sync.md) document
isolation from upstream, shared objects, and support on synced mirrors.

## Repository customization contract

`/new` and `branch/create` both select a public `Flow.make` implementation.
The default first-party `branches` plugin owns `branches/create` and declares
`git:write` plus the `branches/ephemeral` host action. It has no private API.
Repository installation is described in [the creation recipe](../features/branch-creation.md).
Its server-safe registry is separate from the UI registry so the Worker never
loads browser components. The authored flow is packaged as a JSON source asset,
checked byte-for-byte by its packaging test; the startup gate bundles the real
Alchemy entry. Each plugin remains named only in its own built-in registry.

The selector reads `.smithers/branch.json`, the named plugin manifest and its
`.smithers/flows/<plugin>/<flow>/flow.ts` from the same default-branch commit.
`@smthrs/plugin` validates ownership, dependencies and capabilities. A malformed
installation fails closed; it never falls back to the built-in implementation.
The device journals the selected source, SHA, digest, allowed actions and realm
runtime version before executing anything. A resumed run reuses those bytes.

`@smthrs/harness`'s `RealmFlow` executes the actual `@smthrs/flow` and
`@smthrs/plan` interpreter in bounded QuickJS. Repository code has no host
filesystem, network or credentials. Each host action yields to a durable flow
step; its receipt is journaled and replayed through the interpreter. The host
fixes repository, request identity and permissions. Completion requires the
tracked-branch result from one successful host write receipt. A changed digest,
runtime version, second write or invented result is refused.

A repository may explicitly select `branches/github` with `github:write`.
That action uses the server's durable GitHub host and scoped GitHub App access;
GitHub's once adapter derives an owned ref from the request so a crash cannot
adopt an unrelated branch. Admission is not completion: the browser waits for
the persisted result. Migration 0055 stores the admission and completion receipt
in `github_branch_requests`; provider writes and local persistence recover through
the same durable action. Current GitHub identity and write permission are checked
before a write. Existing system authorization, secrets, approval and merge
flows stay non-overridable. `ref_forge` records GitHub explicitly for this path;
existing rows retain the deployment forge. The default path never touches GitHub.

Catalog entries: `@smthrs/effect-code-storage` for provider operations and scoped
Git transport, `@smthrs/flow` and `@smthrs/plan` for durable execution,
`@smthrs/plugin` for installation validation, `@smthrs/harness` for isolated
execution, and `@smthrs/integrations` for explicit GitHub writes.

Production acceptance belongs to the deployer after landing. Local tests use
scripted provider services and faulty Effect services; no non-production
provider credential exists. No production `/new` result is claimed here.

Creation refuses an ordinary mirror ref with the requested name before writing an ephemeral ref: both namespaces share the app identity and URL. An unavailable ordinary-ref read fails closed; an already tracked creation request still resolves before any provider read.

Deployment choices follow decision 0088: `BranchApi.make` captures the GitHub App
and Code Storage client while Alchemy builds the program. `Executions` captures
the App and repository-role allowlist and injects `GitHubCreation.Settings` into
the durable registrations. Selection handlers and creation steps consume these
values without reading Config; the captured allowlist still gates every write.
