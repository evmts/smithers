import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { CardSchema } from "@smthrs/rpc/Cards"
import { LandingCardBody } from "./LandingCards"
import { gitPatch } from "./DiffSurface"
import { patchToCodeViewItems } from "@smthrs/ui/adapters/pierre-diff-view"

const render = (state: string, draft = false) => {
  const card = CardSchema.parse({ id: "pr", kind: "pr", title: "Fix", status: "active", ordinal: 0, createdAt: 1,
    payload: { repo: "owner/repo", number: 2, title: "Fix", state, draft, author: "owner", prBody: "Verified fix", reviews: [], checks: [{ context: "test", state: "success" }] } })
  if (card.kind !== "pr") throw Error("Expected PR")
  return renderToStaticMarkup(<LandingCardBody card={card} onRunCommand={() => {}} />)
}

const renderTab = (payload: Record<string, unknown>) => {
  const card = CardSchema.parse({ id: "pr", kind: "pr", title: "Fix", status: "active", ordinal: 0, createdAt: 1,
    payload: { repo: "owner/repo", number: 2, title: "Fix", state: "merged", author: "owner", prBody: "", reviews: [], checks: [], ...payload } })
  if (card.kind !== "pr") throw Error("Expected PR")
  return renderToStaticMarkup(<LandingCardBody card={card} onRunCommand={() => {}} />)
}

test("finished or queued PRs retain their checks without offering another merge or review", () => {
  for (const state of ["merged", "landed", "closed", "queued", "landing"]) {
    const html = render(state)
    expect(html).toContain("Verified fix")
    expect(html).toContain("test")
    expect(html).not.toContain('data-flow="prs.land"')
    expect(html).not.toContain('data-flow="prs.review"')
  }
})

test("legacy PRs retain review without an executable Land door", () => {
  for (const state of ["open", "failed"]) {
    expect(render(state)).not.toContain('data-flow="prs.land"')
    expect(render(state)).toContain('data-flow="prs.review"')
  }
  for (const [state, draft] of [["draft", false], ["open", true]] as const) {
    expect(render(state, draft)).not.toContain('data-flow="prs.land"')
    expect(render(state, draft)).toContain('data-flow="prs.review"')
  }
})

test("failed and successful-empty tab reads are distinct, and failure retries the same PR", () => {
  const failed = renderTab({ tab: "files", readErrors: { files: "Files unavailable (change not found)" } })
  expect(failed).toContain('role="alert"')
  expect(failed).toContain("Files unavailable (change not found)")
  expect(failed).toContain('data-flow="pr"')
  expect(failed).toContain('data-flow-args="{&quot;number&quot;:2,&quot;repo&quot;:&quot;owner/repo&quot;}"')
  expect(failed).toContain(">Retry</button>")

  const empty = renderTab({ tab: "files", files: [] })
  expect(empty).toContain("No file changes in this pull request.")
  expect(empty).not.toContain('role="alert"')
  expect(empty).not.toContain(">Retry</button>")
})

test("review actions carry the Beta label and its limitations; finished PRs show neither", () => {
  const open = render("open")
  expect(open).toContain('data-maturity="beta"')
  expect(open).toContain(">Beta</span>")
  expect(open).toContain("No line comments or suggested changes yet")
  const merged = render("merged")
  expect(merged).not.toContain('data-maturity="beta"')
})

test("a GitHub source never offers native review or claims unread checks and reviews", () => {
  const markup = renderTab({ sourceRepo: "upstream/project", branch: "smithers/second", baseBranch: "main", state: "open" })
  expect(markup).toContain('href="https://github.com/upstream/project/pull/2"')
  expect(markup).not.toContain('data-flow="prs.review"')
  expect(markup).not.toContain("No reviews")
  expect(markup).not.toContain("No checks")
})

/*
 * The production PR viewer (UI 10a823b3) on roninjin10/e2e-verify#2 — one
 * commit, one check run and README.md +3 −0 per GitHub's own pulls/2/commits,
 * commits/{sha}/check-runs and pulls/2/files — painted the bare "Files
 * unavailable." and "Commits unavailable.", and nothing at all on Checks.
 * These are the four tabs with the reads the platform now proxies for them.
 */
const README_PATCH = "diff --git a/README.md b/README.md\nindex 1111111..2222222 100644\n--- a/README.md\n+++ b/README.md\n@@ -1,3 +1,6 @@\n # e2e-verify\n \n Workflow verification repository.\n+\n+## Build status\n+Build status: verified by the e2e build-status check.\n"

test("a GitHub source's Files changed tab renders the file the proxied diff carried", () => {
  const markup = renderTab({ sourceRepo: "upstream/project", state: "open", tab: "files",
    files: [{ path: "README.md", status: "modified", additions: 3, deletions: 0, patch: README_PATCH }] })
  expect(markup).not.toContain("Files unavailable")
  expect(markup).toContain('aria-label="README.md"')
  expect(markup).toContain("+3")
  expect(markup).not.toContain('role="alert"')
  // The patch reaches the shared renderer as GitHub wrote it: already headed,
  // so `gitPatch` adds nothing, and the pierre adapter reads all three added
  // lines rather than falling back to the verbatim text.
  expect(gitPatch({ path: "README.md", patch: README_PATCH })).toBe(README_PATCH)
  const items = patchToCodeViewItems(README_PATCH)
  expect(items.length).toBe(1)
  const hunk = items[0]!.type === "diff" ? items[0]!.fileDiff.hunks[0] : undefined
  expect(hunk?.additionLines).toBe(3)
  expect(hunk?.deletionLines).toBe(0)
})

test("a GitHub source offers all four tabs and renders the commits and checks it read", () => {
  const tabArg = (tab: string) => `data-flow-args="pr ${tab}"`
  const payload = {
    sourceRepo: "upstream/project",
    state: "merged",
    commits: [{ commitId: "0d1dc5a1a4f0bd02a9e5ba9a1f86e7f1a3b4c5d6", message: "Add build-status line to README", author: "roninjin10", timestamp: "2026-10-14T18:00:00.000Z" }],
    checks: [{ context: "build-status", state: "success" }]
  }
  const offered = renderTab(payload)
  for (const tab of ["conversation", "commits", "checks", "files"]) expect(offered).toContain(tabArg(tab))

  const commits = renderTab({ ...payload, tab: "commits" })
  expect(commits).not.toContain("Commits unavailable")
  expect(commits).toContain("Add build-status line to README")
  expect(commits).toContain("0d1dc5a1")

  // The Checks tab painted nothing for a GitHub source; it now states the
  // checks its head commit reported, with no review or land action beside them.
  const checks = renderTab({ ...payload, tab: "checks" })
  expect(checks).toContain("All checks have passed")
  expect(checks).toContain("build-status")
  expect(checks).toContain('aria-label="Checks"')
  expect(checks).not.toContain('data-flow="prs.review"')
  expect(checks).not.toContain('data-maturity="beta"')
})

test("a refused tab read states its reason and retries; zero rows is not a refusal", () => {
  const payload = { sourceRepo: "upstream/project", state: "merged" }
  for (const tab of ["commits", "checks", "files"] as const) {
    const refused = renderTab({ ...payload, tab, readErrors: { [tab]: `${tab} unavailable (Read failed (HTTP 502).)` } })
    expect(refused).toContain('role="alert"')
    expect(refused).toContain("Read failed (HTTP 502).")
    expect(refused).toContain(">Retry</button>")
  }
  // A refused checks read shows neither the box nor a count that claims zero.
  const refusedChecks = renderTab({ ...payload, tab: "checks", readErrors: { checks: "Checks unavailable (Read failed (HTTP 502).)" } })
  expect(refusedChecks).not.toContain("No checks reported")
  expect(refusedChecks).toContain('data-testid="landing-checks-failure"')

  const empty = renderTab({ ...payload, tab: "checks", commits: [], files: [] })
  expect(empty).toContain("No checks reported")
  expect(empty).not.toContain('role="alert"')
  expect(empty).not.toContain(">Retry</button>")
})

test("a native pull request keeps its merge box, its landing actions and its tabs", () => {
  const native = renderTab({ state: "open", checks: [{ context: "ci", state: "success" }] })
  for (const tab of ["conversation", "commits", "checks", "files"]) expect(native).toContain(`data-flow-args="pr ${tab}"`)
  expect(native).toContain('aria-label="Checks and landing"')
  expect(native).toContain('data-flow="prs.review"')
})

/*
 * A tab whose rows are real but not all of them. GitHub pages a pull
 * request's commits and a commit's check runs, and stops the commit list at
 * 250 however it is paged, so the rows have to be drawn WITH the sentence
 * saying how many of how many they are — the one thing the first candidate
 * could not do, because it read one page and called it the tab.
 */
test("a partly read tab draws its rows and says they are not all of them", () => {
  const payload = { sourceRepo: "upstream/project", state: "merged" }
  const commits = renderTab({
    ...payload,
    tab: "commits",
    commits: [
      { commitId: "0d1dc5a1a4f0bd02a9e5ba9a1f86e7f1a3b4c5d6", message: "Add build-status line to README" },
      { commitId: "1e2d3c4b5a6978899aabbccddeeff00112233445", message: "Tidy the status line" }
    ],
    readLimits: { commits: "Showing 2 of 412 commits." }
  })
  // The rows are the answer: they are drawn, and the shortfall is a status
  // beside them rather than the alert that replaces a refused tab.
  expect(commits).toContain("Add build-status line to README")
  expect(commits).toContain("Tidy the status line")
  expect(commits).toContain("Showing 2 of 412 commits.")
  expect(commits).toContain('data-testid="landing-commits-limit"')
  expect(commits).toContain('role="status"')
  expect(commits).not.toContain('role="alert"')
  expect(commits).not.toContain("Commits unavailable")
  expect(commits).toContain(">Retry</button>")

  const checks = renderTab({
    ...payload,
    tab: "checks",
    checks: [{ context: "build-status", state: "success" }],
    readLimits: { checks: "Showing 100 of 240 check runs." }
  })
  expect(checks).toContain("build-status")
  expect(checks).toContain("Showing 100 of 240 check runs.")
  expect(checks).toContain('data-testid="landing-checks-limit"')
  expect(checks).toContain('aria-label="Checks"')
  expect(checks).not.toContain('role="alert"')
})

test("a tab that read everything draws no limit, and a refused one draws its refusal instead", () => {
  const whole = renderTab({ sourceRepo: "upstream/project", state: "merged", tab: "commits",
    commits: [{ commitId: "0d1dc5a1a4f0bd02a9e5ba9a1f86e7f1a3b4c5d6", message: "Add build-status line to README" }] })
  expect(whole).not.toContain("landing-commits-limit")
  expect(whole).not.toContain("Showing")
  expect(whole).not.toContain('role="status"')

  // A refusal has no rows to qualify: the alert stands alone, as it did.
  const refused = renderTab({ sourceRepo: "upstream/project", state: "merged", tab: "checks",
    readErrors: { checks: "Checks unavailable (Read failed (HTTP 403).)" },
    readLimits: { checks: "Showing 0 of 240 check runs." } })
  expect(refused).toContain('data-testid="landing-checks-failure"')
  expect(refused).not.toContain("landing-checks-limit")
  expect(refused).not.toContain("No checks reported")
})

/*
 * The aggregate conclusion over a list of checks that is not all of them.
 * `checksSummary` read only the rows it was handed, so a hundred successful
 * runs out of two hundred and forty concluded "All checks have passed" in the
 * box header — an approval of runs nobody saw — while the notice right above
 * it said the rows were partial. A conclusion that unseen runs cannot change
 * (a failure) still stands; one they can does not.
 */
test("a partly read checks list is never concluded as all passing, and keeps its rows", () => {
  const partial = renderTab({
    sourceRepo: "upstream/project",
    state: "merged",
    tab: "checks",
    checks: [{ context: "build-status", state: "success" }, { context: "lint", state: "success" }],
    readLimits: { checks: "Showing 100 of 240 check runs." }
  })
  expect(partial).not.toContain("All checks have passed")
  expect(partial).toContain("Some checks could not be read")
  // The runs that WERE read stay readable beside the honest conclusion.
  expect(partial).toContain("build-status")
  expect(partial).toContain("lint")
  expect(partial).toContain("Showing 100 of 240 check runs.")
  expect(partial).toContain('data-testid="landing-checks-limit"')

  // A failing run is a conclusion the unseen ones cannot overturn.
  const failing = renderTab({
    sourceRepo: "upstream/project",
    state: "merged",
    tab: "checks",
    checks: [{ context: "build-status", state: "failure" }, { context: "lint", state: "success" }],
    readLimits: { checks: "Showing 100 of 240 check runs." }
  })
  expect(failing).toContain("1 failing check")
  expect(failing).not.toContain("All checks have passed")

  // Zero rows out of a count that says there are some is not "none reported".
  const none = renderTab({ sourceRepo: "upstream/project", state: "merged", tab: "checks",
    checks: [], readLimits: { checks: "Showing 0 of 9 check runs." } })
  expect(none).not.toContain("No checks reported")
  expect(none).toContain("Some checks could not be read")
})

test("a whole checks read still concludes all passing, and a refused one concludes nothing", () => {
  const whole = renderTab({ sourceRepo: "upstream/project", state: "merged", tab: "checks",
    checks: [{ context: "build-status", state: "success" }] })
  expect(whole).toContain("All checks have passed")
  expect(whole).not.toContain("Some checks could not be read")

  const native = renderTab({ state: "open", checks: [{ context: "ci", state: "success" }] })
  expect(native).toContain("All checks have passed")
  expect(native).toContain('aria-label="Checks and landing"')

  // A refused read has no conclusion to draw: no all-pass, no empty claim.
  const refused = renderTab({ sourceRepo: "upstream/project", state: "merged", tab: "checks",
    checks: [], readErrors: { checks: "Checks unavailable (Read failed (HTTP 403).)" } })
  expect(refused).not.toContain("All checks have passed")
  expect(refused).not.toContain("No checks reported")
  expect(refused).toContain('data-testid="landing-checks-failure"')
})

test("an unread PR base never invents main, and a reported base is retained (#3831)", () => {
  const unread = renderTab({ branch: "fix/retry" })
  expect(unread).not.toContain("main</span>")
  expect(unread).not.toContain("into ")
  const reported = renderTab({ branch: "fix/retry", baseBranch: "release" })
  expect(reported).toContain("release</span>")
  expect(reported).toContain("fix/retry</span>")
})
