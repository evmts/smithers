import { scenario } from "./coverage/types"
import { expect, realApi, reloadApp } from "./support/test"
import { authenticatedTest } from "./auth-permissions/profile"
import { issueCard } from "./issues/cloud"
import { attachJson, runSlash } from "./issues/local"
import { attachProductionJson, bootProductionRepository, PRODUCTION_REPO, repositoryApiPath } from "./repositories-github/production"
import {
  committedTransitions,
  declaredNeedsPerson,
  ISSUE_POLICY_ACCEPT,
  ISSUE_POLICY_PROPOSE,
  ISSUE_POLICY_TRANSITIONS,
  ISSUE_POLICY_UNDECLARED,
  issuePolicyLabels,
  issuePolicyRepository,
  openGitHubIssue,
  readCommittedIssuePolicy,
  readDeclaredTransitions,
  readGitHubIssue,
  runDeclaredTransition,
  transitionPath
} from "./support/issue-policy-fixture"

/*
 * `issues.transition` (M-47, #4027): the workflow a repository declares for
 * ITSELF.
 *
 * The move is NOT an app stage and not a second issue tracker. The
 * repository declares it in its own `.smithers/FACTORY.ts`, its own
 * generator projects it into `.smithers/factory.json`, and the server reads
 * that committed file at the repository's default bookmark; the labels come
 * from there and never from the request, which names only an issue number
 * and a transition id. These scenarios therefore drive the DECLARED policy
 * of a repository that carries `e2e/real/support/issue-policy-fixture.ts`'s fixture —
 * read back first through the product's own contents door, so a run against
 * a repository carrying something else fails on the declaration instead of
 * proving the wrong policy — and they assert GitHub's own answer about the
 * issue, never the client's.
 *
 * The sibling GitHub-tracker acts (`issues.comment`/`close`/`reopen`,
 * issues.spec.ts) cannot stand in for this: none of them reads a
 * repository's declaration, and none of them can move an issue through a
 * state the repository invented.
 *
 * `SMITHERS_REAL_ISSUE_POLICY_REPO` names the repository that carries the
 * declaration. Which repository declares a policy is the operator's choice,
 * so these scenarios never invent one; see
 * `ROOT-NOTE-issue-policy-real-scenario-102.md` for the activation steps.
 */

authenticatedTest.setTimeout(900_000)

authenticatedTest(
  "a repository's own declared proposed-to-accepted move is run by a person, read back from GitHub, survives a reload, and is not repeated",
  scenario("issues.transition-declared-person-move", {
    capabilities: ["identity", "cloud"],
    description: "Drive the declared proposed-to-accepted issue policy of a repository that commits it: read the committed declaration and the list door, run both declared moves through the typed door, read the labels back from GitHub, see the move after a reload, and prove a repeat neither moves the issue again nor says it twice.",
    coverage: [
      "action:issues.transition", "action:issues.create", "action:issues.list", "action:issues.close",
      "host:production", "path:success", "path:persistence", "door:slash", "door:button",
      "dimension:declared-policy", "dimension:person-authority", "dimension:idempotency", "dimension:reload",
      "evidence:committed-declaration-and-github-label-readback"
    ]
  }),
  async ({ page, request }, testInfo) => {
    const repo = issuePolicyRepository()
    await bootProductionRepository(page, repo)

    // The policy this scenario drives is the repository's COMMITTED one: its
    // own projection, read through the product's contents door. Only the
    // declared transitions have to be the fixture's — everything else in that
    // document is the repository's own and is left exactly as it is.
    const committed = await readCommittedIssuePolicy(page, request, repo)
    expect(committedTransitions(committed)).toEqual(ISSUE_POLICY_TRANSITIONS)
    const declared = await readDeclaredTransitions(page, request, repo)
    expect(declared).toEqual(committedTransitions(committed))
    expect(declaredNeedsPerson(committed, ISSUE_POLICY_ACCEPT.id)).toBe(true)

    const title = `issue policy 102 ${Date.now()} ${Math.random().toString(36).slice(2, 9)}`
    const number = await openGitHubIssue(page, request, repo, title, (line) => runSlash(page, line))
    const opened = await readGitHubIssue(page, request, repo, number)
    expect(opened.labels).not.toContain(ISSUE_POLICY_PROPOSE.to)
    expect(opened.labels).not.toContain(ISSUE_POLICY_ACCEPT.to)

    try {
      const proposed = await runDeclaredTransition(page, repo, number, ISSUE_POLICY_PROPOSE.id, (line) => runSlash(page, line))
      expect(proposed.status).toBe(202)
      // The declaration decides the labels, so the request carries none.
      expect(proposed.body).toBeNull()
      expect(proposed.key).not.toBeNull()
      await expect.poll(async () => (await readGitHubIssue(page, request, repo, number)).labels, { timeout: 300_000, intervals: [2_000, 3_000, 5_000] })
        .toContain(ISSUE_POLICY_PROPOSE.to)

      const accepted = await runDeclaredTransition(page, repo, number, ISSUE_POLICY_ACCEPT.id, (line) => runSlash(page, line))
      expect(accepted.status).toBe(202)
      expect(accepted.key).not.toBe(proposed.key)
      await expect.poll(async () => (await readGitHubIssue(page, request, repo, number)).labels, { timeout: 300_000, intervals: [2_000, 3_000, 5_000] })
        .toEqual(expect.arrayContaining([ISSUE_POLICY_ACCEPT.to]))
      const moved = await readGitHubIssue(page, request, repo, number)
      // The declared move: the label it applies is on, the one it leaves is off.
      expect(moved.labels).toContain(ISSUE_POLICY_ACCEPT.to)
      expect(moved.labels).not.toContain(ISSUE_POLICY_ACCEPT.from)
      // One attribution per move, said only after GitHub showed the move.
      expect(moved.comments).toBe(opened.comments + 2)

      // The move is the repository's state, so it is there after a reload.
      await reloadApp(page)
      await runSlash(page, `/issues.list all ${repo}`)
      const list = page.locator('.smithers-card[data-kind="issue-list"]').filter({ hasText: repo }).last()
      const row = list.locator(`[data-issue="${number}"]`)
      await expect(row).toContainText(title)
      await expect(row).toContainText(ISSUE_POLICY_ACCEPT.to)
      await expect(row).not.toContainText(ISSUE_POLICY_ACCEPT.from!)
      // And through the row's own button: the issue the person opens is the
      // one that moved.
      await row.locator('button[data-flow="issues.view"]').click()
      const card = issueCard(page, repo, number)
      await expect(card).toContainText(title)

      // Asking for the same move again replays the one admitted operation.
      const again = await runDeclaredTransition(page, repo, number, ISSUE_POLICY_ACCEPT.id, (line) => runSlash(page, line))
      expect(again.status).toBe(202)
      expect(again.key).toBe(accepted.key)
      const after = await readGitHubIssue(page, request, repo, number)
      expect(after.labels).toEqual(moved.labels)
      expect(after.comments).toBe(moved.comments)

      await attachProductionJson(testInfo, "issue-policy-declared-move", {
        repo,
        issue: number,
        title,
        declared,
        labels: { opened: opened.labels, proposed: ISSUE_POLICY_PROPOSE.to, moved: moved.labels, afterRepeat: after.labels },
        comments: { afterMove: moved.comments, afterRepeat: after.comments },
        idempotency: { propose: proposed.key !== null, accept: accepted.key === again.key }
      })
    } finally {
      await runSlash(page, `/issues.close ${number} ${repo} --source github`)
    }
  }
)

authenticatedTest(
  "a move the repository does not declare is refused on its own declaration, and the typed repository is the only one addressed",
  scenario("issues.transition-undeclared-refusal", {
    capabilities: ["identity", "cloud"],
    description: "Ask a declaring repository for a transition id it declares nowhere while another repository is active: the server refuses on the repository's own declaration, the request that left named the typed repository, no request reached the active repository, and the issue's labels are unchanged.",
    coverage: [
      "action:issues.transition", "host:production", "path:error", "door:slash",
      "dimension:declared-policy", "dimension:undeclared-transition", "dimension:typed-target",
      "evidence:service-refusal-status-and-unchanged-github-labels"
    ]
  }),
  async ({ page, request }, testInfo) => {
    const repo = issuePolicyRepository()
    const active = PRODUCTION_REPO
    expect(active).not.toBe(repo)
    await bootProductionRepository(page, repo)
    const declared = await readDeclaredTransitions(page, request, repo)
    expect(declared.map((transition) => transition.id)).not.toContain(ISSUE_POLICY_UNDECLARED)

    // Make the OTHER repository the active one, so the typed target below is
    // the only thing that can decide which repository is addressed.
    await runSlash(page, `/repo.select ${active}`)
    const observed: Array<{ readonly method: string; readonly path: string }> = []
    page.on("request", (outbound) => {
      const url = new URL(outbound.url())
      if (/\/github\/issues\//.test(url.pathname)) observed.push({ method: outbound.method(), path: url.pathname })
    })

    const title = `issue policy 102 undeclared ${Date.now()} ${Math.random().toString(36).slice(2, 9)}`
    const number = await openGitHubIssue(page, request, repo, title, (line) => runSlash(page, line))
    const before = await readGitHubIssue(page, request, repo, number)
    const refused = await realApi(page, request, "POST", transitionPath(repo, number, ISSUE_POLICY_UNDECLARED))
    await runSlash(page, `/issues.transition ${number} ${ISSUE_POLICY_UNDECLARED} ${repo}`)
    await expect(page.locator(".smithers-chat-message").filter({ hasText: `Could not move issue #${number}` }).last()).toBeVisible()

    // The refusal is the repository's own declaration, answered before
    // anything was asked of GitHub: the issue carries no fixture label.
    expect(refused.status()).toBe(404)
    expect(await refused.json()).toMatchObject({ code: "issue_transition_undeclared" })
    expect(observed.filter(({ path }) => path.startsWith(repositoryApiPath(active)))).toEqual([])
    expect(observed.filter(({ method }) => method === "POST").map(({ path }) => path))
      .toEqual([transitionPath(repo, number, ISSUE_POLICY_UNDECLARED)])
    const after = await readGitHubIssue(page, request, repo, number)
    expect(after.labels).toEqual(before.labels)
    expect(after.labels.filter((label) => issuePolicyLabels().includes(label))).toEqual([])
    await runSlash(page, `/issues.close ${number} ${repo} --source github`)
    await attachJson(testInfo, "issue-policy-undeclared-refusal", {
      repo,
      active,
      issue: number,
      title,
      undeclared: ISSUE_POLICY_UNDECLARED,
      declared: declared.map((transition) => transition.id),
      refusalStatus: refused.status(),
      labels: { before: before.labels, after: after.labels },
      observed
    })
  }
)
