import { Egress } from "@smthrs/secrets"
import { Effect, Layer, Metric } from "effect"
import type { HttpClient, HttpServerRequest, HttpServerResponse } from "effect/http"
import type { SandboxBranch } from "./Sandboxes.ts"

// A check job's egress (docs/features/pulls.md#where-checks-run): what a throwaway job machine's outbound HTTP and HTTPS
// reach. A repository's checks install its packages, so a job's box reaches the package registry and dprint's plugins,
// and nothing else: no other host, and never a secret, since a job's box holds no placeholder. A branch's own machine
// stays closed (its egress is the secrets egress, and only with SANDBOX_SECRETS on). Wired by the job's `SandboxObject`
// (worker/BranchSandboxes.ts), which routes the box's outbound requests here; `@smthrs/secrets`' `Egress.forward`
// decides each one under a policy with no secrets, never follows a redirect, and logs `secrets.egress` per request.

/** The hosts a check job's box may reach: npm's registry (packages, and pnpm itself) and dprint's plugins. */
export const JOB_EGRESS_HOSTS = ["registry.npmjs.org", "plugins.dprint.dev"] as const

/** Whether `branch` is a check job's machine, whose box reaches `JOB_EGRESS_HOSTS`. */
export const isJob = (branch: SandboxBranch | undefined): boolean => branch?.kind === "job"

/**
 * What a job's commands get so their tools trust the egress's CA `ca`, which signs the HTTPS the egress reads: Node
 * (pnpm) through `NODE_EXTRA_CA_CERTS`, and dprint, whose own TLS stack reads `DPRINT_CERT`. The system store trusts it
 * too, from the wake (EGRESS_SETUP).
 */
export const trustOf = (ca: string): Readonly<Record<string, string>> => ({ NODE_EXTRA_CA_CERTS: ca, DPRINT_CERT: ca })

/** The policy a job's box is held to: no secret, and only `JOB_EGRESS_HOSTS`. */
export const POLICY: Egress.Policy = { secrets: [], allow: JOB_EGRESS_HOSTS }

/** Requests a job's box made, by `outcome`: `forwarded`, or the refusal's code. */
export const requests = Metric.counter("smithers_job_egress_requests", {
  description: "Outbound requests from check jobs' machines, by outcome",
  incremental: true,
})

// No secret is ever revealed: the policy names none, so the vault is never asked.
const vault = Layer.succeed(
  Egress.Vault,
  Egress.Vault.of({ reveal: (name) => Effect.fail(new Egress.SecretUnavailable({ name })) }),
)

// A job's decisions are counted, not stored: they reveal no secret, so `secret_events` has nothing to keep, and a
// package install makes hundreds.
const audit = Layer.succeed(
  Egress.Audit,
  Egress.Audit.of({ record: (entry) => Metric.update(Metric.withAttributes(requests, { outcome: entry.outcome }), 1) }),
)

/** The forwarder's vault and audit for a job: no secret to reveal, decisions counted. */
export const services = Layer.merge(vault, audit)

/** Answers one of a job's box's outbound requests: forwarded to an allowed host, else refused (403). */
export const forward = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, HttpClient.HttpClient> =>
  Egress.forward(request, POLICY).pipe(
    Effect.provide(services),
    Effect.withSpan("sandbox.job.egress"),
  )
