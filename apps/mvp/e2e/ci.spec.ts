import { createHmac, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { expect, test } from "./devices"
import { field, type LogRecord, LogTail } from "./logs"
import { requires } from "./target"

// CI on Smithers (docs/features/ci.md): a person pushes a branch to a test repository, and its own flow,
// `.smithers/flows/ci/flow.ts` on the default branch's trigger, runs each job on its own machine at the pushed commit
// and reports `smithers/ci` on it, as GitHub shows a check. The repository (`E2E_REPO_FLOWS_REPOSITORY`, never a
// smithersai one) holds e2e/fixtures/ci-repo on its default branch; the instance runs with REPO_FLOWS=true and the
// GitHub App installed there with Contents: read and Commit statuses: read and write.
//
// The push is real, as the test account (`E2E_GITHUB_TOKEN`). The App's one webhook URL points at production, so this
// test delivers the push to the instance under test itself, signed as GitHub signs it, with GitHub's own payload shape.
// Each step waits for the run's own records (e2e/logs.ts), then the status on GitHub's commit page.

const REPOSITORY = process.env.E2E_REPO_FLOWS_REPOSITORY ?? ""
const API = "https://api.github.com"

/** GitHub's REST API as the test account. */
const github = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${process.env.E2E_GITHUB_TOKEN}`,
      "x-github-api-version": "2022-11-28",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error(`GitHub answered ${response.status} to ${method} ${path}`)
  return response.status === 204 ? undefined : (await response.json() as Record<string, unknown>)
}

/** Pushes one commit adding `ci-e2e.txt` onto the default branch's head, as branch `branch`: its SHA. */
const push = async (branch: string, word: string) => {
  const repo = await github("GET", `/repos/${REPOSITORY}`) as { default_branch: string }
  const head = await github("GET", `/repos/${REPOSITORY}/git/ref/heads/${repo.default_branch}`) as { object: { sha: string } }
  const base = await github("GET", `/repos/${REPOSITORY}/git/commits/${head.object.sha}`) as { tree: { sha: string } }
  const tree = await github("POST", `/repos/${REPOSITORY}/git/trees`, {
    base_tree: base.tree.sha,
    tree: [{ path: "ci-e2e.txt", mode: "100644", type: "blob", content: `${word}\n` }],
  }) as { sha: string }
  const commit = await github("POST", `/repos/${REPOSITORY}/git/commits`, {
    message: `CI e2e ${word}`,
    tree: tree.sha,
    parents: [head.object.sha],
  }) as { sha: string }
  await github("POST", `/repos/${REPOSITORY}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha })
  return { sha: commit.sha, before: head.object.sha, defaultBranch: repo.default_branch }
}

/** The records named `message` whose `field` is `value`, in arrival order. */
const recordsOf = async (logs: LogTail, message: string, key: string, value: string) =>
  (await logs.records()).own.filter((record: LogRecord) => record.message === message && field(record, key) === value)

test("ci: a push runs the repository's flow, each job on its own machine, and GitHub shows smithers/ci passed", {
  annotation: { type: "summary", description: "A push runs the repository's own CI on Smithers machines; GitHub shows the check." },
}, async ({ devices, request }) => {
  requires("githubApp", "webhookSecret", "localLogs", "repoFlows")
  test.setTimeout(20 * 60_000)
  const logs = await LogTail.start()
  const [a] = await devices.open("A")
  const branch = `smithers-ci-e2e-${devices.word}`
  try {
    const pushed = await test.step("Push a commit to a branch", () => push(branch, devices.word))
    const delivery = randomUUID()
    await test.step("GitHub delivers the push", async () => {
      const body = JSON.stringify({
        ref: `refs/heads/${branch}`,
        before: "0".repeat(40),
        after: pushed.sha,
        created: true,
        deleted: false,
        repository: { full_name: REPOSITORY, default_branch: pushed.defaultBranch },
      })
      const signature = createHmac("sha256", process.env.E2E_GITHUB_WEBHOOK_SECRET!).update(body).digest("hex")
      const delivered = await request.post("/api/github/webhook", {
        headers: {
          "content-type": "application/json",
          "x-github-event": "push",
          "x-github-delivery": delivery,
          "x-hub-signature-256": `sha256=${signature}`,
        },
        data: body,
      })
      expect(delivered.status()).toBe(200)
    })
    const run = `ci:${delivery}`
    await test.step("The default branch's trigger starts the ci flow", async () => {
      await expect.poll(async () => (await recordsOf(logs, "ci.dispatch", "delivery", delivery)).map((record) => field(record, "outcome")), {
        timeout: 2 * 60_000,
      }).toEqual(["matched"])
      await expect.poll(async () => (await recordsOf(logs, "ci.repo_flow.plan", "run", run)).map((record) => field(record, "outcome")), {
        timeout: 3 * 60_000,
      }).toEqual(["planned"])
    })
    await test.step("Each job runs on its own machine at the commit", async () => {
      await expect.poll(
        async () => (await recordsOf(logs, "ci.job.call", "run", run)).filter((record) => field(record, "call") === "step").length,
        { timeout: 12 * 60_000, intervals: [5_000] },
      ).toBe(4)
      const checkouts = await recordsOf(logs, "ci.job.call", "run", run)
      expect(checkouts.filter((record) => field(record, "call") === "checkout").map((record) => [field(record, "job"), field(record, "outcome")]).sort())
        .toEqual([["checkout", "exact"], ["toolchain", "exact"]])
    })
    await test.step("smithers/ci is reported passed on the commit", async () => {
      await expect.poll(
        async () => (await recordsOf(logs, "ci.repo_flow.status", "run", run)).map((record) => [field(record, "state"), field(record, "outcome")]),
        { timeout: 2 * 60_000 },
      ).toContainEqual(["success", "sent"])
      const combined = await github("GET", `/repos/${REPOSITORY}/commits/${pushed.sha}/status`) as {
        statuses: Array<{ context: string; state: string; description: string }>
      }
      expect(combined.statuses.find((status) => status.context === "smithers/ci")).toMatchObject({ state: "success", description: "Passed" })
    })
    await test.step("GitHub shows the check on the commit", async () => {
      await a.page.goto(`https://github.com/${REPOSITORY}/commit/${pushed.sha}`)
      await a.page.getByRole("button", { name: /checks?/i }).first().click().catch(() => undefined)
      await expect(a.page.getByText("smithers/ci").first()).toBeVisible({ timeout: 30_000 })
    })
  } finally {
    await github("DELETE", `/repos/${REPOSITORY}/git/refs/heads/${branch}`).catch(() => undefined)
    await logs.dispose()
  }
})

test("ci fixture: the test repository's flow is the one e2e/fixtures/ci-repo holds", async () => {
  // What a person merges onto the test repository's default branch, once, so the e2e above has a trigger and a flow.
  const manifest = JSON.parse(readFileSync(new URL("./fixtures/ci-repo/.smithers/factory.json", import.meta.url), "utf8"))
  expect(manifest.contributes.triggers).toEqual([
    { on: "github.push", flow: "ci", title: "Every push to an e2e branch", branches: ["smithers-ci-e2e-*"] },
  ])
})
