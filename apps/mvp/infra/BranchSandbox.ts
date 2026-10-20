// The branch sandbox's container (decision 0013 §9, docs/features/branch-workspace.md#the-machine): one image, built
// from infra/sandbox/Dockerfile, that each branch's `SandboxObject` (worker/BranchSandboxes.ts) starts on demand under
// the `durable_object` scheduling policy, one container per branch. Alchemy builds it, pins it by digest and prepares
// it before the Worker is uploaded; `alchemy dev` runs it through local workerd and Docker. Per-instance settings go to
// `start()`, never here: the policy refuses deployment-wide ones.
import * as Cloudflare from "alchemy/Cloudflare"

export class BranchSandbox extends Cloudflare.Container<BranchSandbox>()("BranchSandbox", {
  schedulingPolicy: "durable_object",
  context: `${import.meta.dirname}/sandbox`,
}) {}
