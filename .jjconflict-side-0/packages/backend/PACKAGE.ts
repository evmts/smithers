import { Smithers } from "@smthrs/targets"

/** Backend-owned inputs for the root Go build and test gate. */
const buildInputs = Smithers.Filegroup({
  srcs: [Smithers.glob("**/*")],
  cwd: "packages/backend"
})

/** Backend-owned machine protocol fixtures used by the daemon crate. */
const machineContractInputs = Smithers.Filegroup({
  cwd: "packages/backend",
  srcs: [Smithers.glob("internal/compose/testdata/cocontracts/**")]
})

/** Checks the App setup guide against the source it documents.
 * Refresh the receipt with `smthrs docs //packages/backend:docs --write`.
 * @since 1.0.0
 * @category documentation
 */
const docs = Smithers.Docs.Check({
  output: Smithers.file("docs/github-app.md"),
  stamp: Smithers.file("docs/github-app.stamp.json"),
  inputs: [
    Smithers.file("internal/services/github_app_manifest.go"),
    Smithers.file("internal/services/github_app_credentials.go"),
    Smithers.file("internal/services/github_synced_repos.go"),
    Smithers.file("internal/services/github_synced_delivery.go"),
    Smithers.file("internal/services/github_synced_refs.go"),
    Smithers.file("internal/services/github_synced_events.go"),
    Smithers.file("internal/services/github_synced_conditional.go"),
    Smithers.file("internal/services/github_synced_cursor.go"),
    Smithers.file("internal/services/github_synced_poll.go"),
    Smithers.file("internal/services/github_sync.go"),
    Smithers.file("internal/services/github_main_pull.go"),
    Smithers.file("internal/services/github_synced_pull.go"),
 Smithers.file("internal/services/github_synced_related.go"),
    Smithers.file("internal/services/github_synced_comments.go"),
    Smithers.file("internal/services/mythical_github_poll.go"),
    Smithers.file("internal/db/mythical_ext.go"),
    Smithers.file("internal/services/mythical_items.go"),
    Smithers.file("internal/services/mythical_outbound.go"),
    Smithers.file("internal/services/flow_catalog.go"),
    Smithers.file("internal/services/flow_versions.go"),
    Smithers.file("internal/services/mythical_pr.go"),
    Smithers.file("internal/services/mythical_todo_state.go"),
    Smithers.file("internal/services/mythical_todo_read.go"),
    Smithers.file("internal/repohost/refs.go"),
    Smithers.file("internal/services/mythical.go"),
    Smithers.file("internal/services/landing_github_pull.go"),
    Smithers.file("internal/services/github_issue_text_writer.go"),
    Smithers.file("internal/services/mythical_issue_events.go"),
    Smithers.file("internal/services/mythical_github.go"),
    Smithers.file("internal/services/github_budget.go"),
    Smithers.file("internal/services/github_response.go"),
    Smithers.file("internal/pkg/errors/registry.go"),
    Smithers.file("internal/services/github_access_diagnosis.go"),
    Smithers.file("internal/services/github_app_installations.go"),
    Smithers.file("internal/services/github_repo_metadata.go"),
    Smithers.file("internal/services/github_repo_list.go"),
    Smithers.file("internal/services/github_user_repos.go"),
    Smithers.file("internal/services/auth.go"),
    Smithers.file("internal/services/github_pull_diff.go"),
    Smithers.file("internal/services/github_issue_comments.go"),
    Smithers.file("internal/services/github_repo_read_access.go"),
    Smithers.file("internal/services/github_repo_push_access.go"),
    Smithers.file("internal/services/github_import.go"),
    Smithers.file("internal/services/member_roster.go"),
    Smithers.file("internal/services/members.go"),
    Smithers.file("internal/services/member_recheck.go"),
    Smithers.file("internal/services/member_poll.go"),
    Smithers.file("internal/cleanup/periodic.go"),
    Smithers.file("internal/cleanup/export.go"),
    Smithers.file("internal/services/install_machine_ready.go"),
    Smithers.file("internal/services/install_setup.go"),
    Smithers.file("internal/pkg/errors/errors.go"),
    Smithers.file("internal/routes/members.go"),
    Smithers.file("internal/services/repo_connection_github_app.go"),
    Smithers.file("internal/compose/main.go"),
    Smithers.file("internal/compose/github_sync.go"),
    Smithers.file("internal/compose/runtime_helpers.go"),
    Smithers.file("internal/auth/github.go"),
    Smithers.file("internal/auth/github_oauth_error.go"),
    Smithers.file("internal/services/install_setup_session.go"),
    Smithers.file("internal/routes/github_app_setup.go"),
    Smithers.file("internal/middleware/effective_origin.go"),
    Smithers.file("db/product/queries/github_app.sql"),
    Smithers.file("db/product/migrations/0105_github_app.sql"),
    Smithers.file("db/product/migrations/0132_github_comment_sources.sql"),
    Smithers.file("db/product/queries/github_synced_repos.sql"),
    Smithers.file("//docs/api/openapi/install.yaml")
  ]
})

/** Dark PostgreSQL label-snapshot regression, enabled when selected explicitly. */
const journeyTodoLabel = Smithers.NodeTest({
  runner: Smithers.entrypoint(Smithers.file("run-journey-todo-label.mjs")),
  srcs: [Smithers.glob("**/*.go"), Smithers.glob("db/product/migrations/*.sql"),
    Smithers.file("//go.mod"), Smithers.file("//go.sum")],
  deps: [], exclusive: true, cache: false, timeout: "15m", cwd: "packages/backend"
})

/** Security checks for the backend's trust boundaries: the credential
 * egress relay, the preview gateway, the credit ledger and host execution.
 * @since 1.0.0
 * @category security
 */
const securityReview = Smithers.SecurityReview({
  cwd: "packages/backend",
  include: [
    "egressrelay/**/*.go", "previewgateway/**/*.go", "credits/**/*.go", "modelprice/**/*.go",
    "hostexec/**/*.go", "ironproxy/**/*.go", "sandbox/**/*.go",
    Smithers.glob("scripts/*.mjs", { exclude: ["scripts/*.test.mjs"] }), "scripts/*.sh",
    Smithers.glob("scripts/*.py", { exclude: ["scripts/test_*.py"] })
  ],
  checks: [
    {
      id: "relay-values-stay-bound",
      title: "The egress relay sends a secret only to its bound host and masks it out of every response",
      threat:
        "Code running in a workspace guest reads a platform or user secret, or sends it to a host the secret was not bound to.",
      lookFor: [
        "A placeholder substituted into a request whose host is not exactly one of the secret's bound hosts, after case folding, IDNA, a trailing dot or an IPv6 bracket.",
        "A response header, reason phrase, trailer, error message or body chunk boundary through which a bound value reaches the guest unmasked.",
        "A dial to a private, loopback, link-local or metadata address that Config.Local does not name exactly, including through DNS resolving to such an address.",
        "A request that keeps substituting after its binding was revoked or replaced, or an audit event carrying a value, query string or credential.",
        "Response masking whose cost grows faster than linearly in the body size."
      ],
      paths: ["egressrelay/**", "ironproxy/**", "sandbox/**"]
    },
    {
      id: "preview-access-rechecked",
      title: "A user preview is served only to a viewer whose grant the API confirmed within the recheck interval",
      threat: "A viewer whose share was removed, or anyone who learns a preview hostname, keeps reading a private workspace preview.",
      lookFor: [
        "A ticket accepted for another purpose, another domain, after expiry plus the skew allowance, or with a signature compared in variable time.",
        "A platform domain (smithers-desk-*, smithers-gw-*) served without the relay token.",
        "The session cookie, relay token or exchange ticket forwarded to guest code, or a guest Set-Cookie that overwrites the session cookie.",
        "An upgraded socket or streaming response that outlives a revoked grant."
      ],
      paths: ["previewgateway/**"]
    },
    {
      id: "credit-never-overspent",
      title: "A platform-funded model call reserves before it spends and settles exactly once",
      threat: "A user runs platform-key model calls without paying, or a retry or race charges a user twice.",
      lookFor: [
        "A ledger write that does not lock the account row first, so concurrent reservations overspend.",
        "A retry of the same request key that reaches the provider again, or a settlement that can apply twice.",
        "A model with no price, an unknown long-context price, or negative usage that is charged zero instead of refused.",
        "An integer overflow or rounding toward zero in a nanodollar computation."
      ],
      paths: ["credits/**", "modelprice/**"]
    },
    {
      id: "host-children-pinned",
      title: "Host children run by absolute path with a built environment",
      threat: "A repository's config or an inherited environment variable makes the backend run attacker code on its host.",
      lookFor: [
        "A child started by name through PATH, or with the backend's inherited environment, or with a GIT_*, DYLD_* or LD_* variable.",
        "A git invocation that leaves repository hooks, fsmonitor or alternateRefsCommand enabled."
      ],
      paths: ["hostexec/**"]
    },
    {
      id: "script-subprocess-args",
      title: "Backend scripts spawn processes with argument vectors, never shell strings built from inputs",
      threat:
        "A crafted CLI flag, environment value or file name makes a backend build or test script run arbitrary shell commands on a maintainer or CI host.",
      lookFor: [
        "exec, execSync or spawn with shell:true, or sh -c, interpolating argv, environment variables, file contents or git output.",
        "An unvalidated positional argument placed into go build -ldflags or a similar command-line flag string."
      ],
      paths: ["scripts/build-backend.sh", "scripts/test-backend-consumer.sh"]
    }
  ]
})

/** The per-tag product API sources `scripts/openapi-bundle.mjs` bundles. */
const apiSchemas = Smithers.Filegroup({ cwd: "docs/api/openapi", srcs: [Smithers.glob("*.yaml")] })

/** The access-test list behind //:backendGoAccess and the compose file runner behind //:backendGo. */
const goTestRunners = Smithers.NodeTest({
  runner: Smithers.testRunner([
    Smithers.file("scripts/backend-access-tests.test.mjs"),
    Smithers.file("scripts/backend-compose-tests.test.mjs")
  ]),
  srcs: [],
  deps: [buildInputs],
  cwd: "packages/backend"
})

/** Hosting drift gate: deployment-mode branches in the backend, app and API spec stay frozen. */
const deploymentBranches = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("scripts/check-deployment-branches.test.mjs")]),
  srcs: [Smithers.file("//docs/api/openapi.yaml")],
  deps: [buildInputs, apiSchemas, Smithers.Filegroup({ cwd: "apps/app", srcs: [Smithers.glob("src/**/*"), Smithers.file("package.json")] })],
  cwd: "packages/backend"
})

// The per-tag OpenAPI bundler: ordering, refusals, merge-freedom across tags,
// and that the committed bundle matches its sources.
const openapiBundle = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("scripts/openapi-bundle.test.mjs")]),
  srcs: [Smithers.file("scripts/openapi-bundle.mjs"), Smithers.file("//docs/api/openapi.yaml")],
  deps: [apiSchemas],
  cwd: "packages/backend"
})

// The product API client generator: naming, schema mapping, refusals, the
// --check drift report, and that the committed clients match the spec.
const openapiClients = Smithers.NodeTest({
  runner: Smithers.testRunner([Smithers.file("scripts/openapi-clients.test.mjs")]),
  srcs: [
    Smithers.file("scripts/openapi-clients.mjs"),
    Smithers.file("//docs/api/openapi.yaml"),
    Smithers.file("apiclient/client.gen.go"),
    Smithers.file("//packages/smithers/src/internal/backend/ProductApi.ts")
  ],
  deps: [],
  cwd: "packages/backend"
})

/** The backend package: build inputs, script gates, the documentation freshness gate and the security review.
 * @since 1.0.0
 * @category packages
 */
export const Package = Smithers.Package({ targets: {
  machineContractInputs, buildInputs, apiSchemas, docs, goTestRunners, deploymentBranches, openapiBundle, openapiClients,
  journeyTodoLabel, ...securityReview
} })
