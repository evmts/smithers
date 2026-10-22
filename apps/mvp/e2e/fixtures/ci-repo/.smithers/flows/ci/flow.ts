// The test repository's CI (apps/mvp/e2e/ci.spec.ts): two jobs, each on its own Smithers machine at the pushed commit.
import { Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { CiJob } from "@smthrs/sandbox"
import { Schema } from "effect"

const toolchain = CiJob.make("toolchain", {
  steps: [{ name: "node", run: "node --version" }, { name: "pnpm", run: "pnpm --version" }],
})

const checkout = CiJob.make("checkout", {
  steps: [{ name: "readme", run: "test -f README.md" }, { name: "marker", run: "test -f ci-e2e.txt" }],
})

export default Flow.make("ci", {
  description: "Every push to an e2e branch: the toolchain and the checkout.",
  payload: { run: Schema.String, repo: Schema.String, sha: Schema.String, ref: Schema.String, event: Schema.String },
  success: Schema.Struct({ toolchain: CiJob.Result, checkout: CiJob.Result }),
  body: (run) => Node.all({ toolchain: toolchain.call(run), checkout: checkout.call(run) }),
})
