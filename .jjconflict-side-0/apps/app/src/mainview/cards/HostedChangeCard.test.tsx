import { lintCopy } from "./productWords"
import { readFileSync } from "node:fs"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { afterAll, expect, test } from "bun:test"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { HostedChangeView } from "./HostedChangeCard"
import type { HostedObservation } from "../state/seams/HostedChange"
GlobalRegistrator.register()
afterAll(async () => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  await GlobalRegistrator.unregister()
})
const base: HostedObservation = {
  id: "s",
  repo: "maya/tinyhttp",
  request: "add slugify",
  sessionId: "s",
  owner: "maya",
  phase: "done",
  accepted: true,
  session: {
    id: "s",
    status: "completed",
    workspace: null,
    run: null,
    reason: null,
    reason_code: null,
    retryable: false
  },
  result: {
    head_commit: "abc",
    head_change_id: "c",
    test_receipt: {
      command: "bun test",
      exit_code: 0,
      tests_run: 33,
      commit: "abc",
      finished_at: "now",
      output_tail: ""
    }
  },
  pull: null,
  files: [{ path: "src/slug.ts", additions: 18, deletions: 0 }],
  error: null,
  stages: {}
}
const render = (row: HostedObservation) => {
  const calls: unknown[] = []
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  flushSync(() =>
    root.render(
      <HostedChangeView
        row={row}
        run={(...args) => {
          calls.push(args)
        }}
      />
    )
  )
  return {
    host,
    calls,
    update: (row: HostedObservation) => flushSync(() => root.render(<HostedChangeView row={row} run={(...args) => { calls.push(args) }} />)),
    close: () => {
      flushSync(() => root.unmount())
      host.remove()
    }
  }
}
test("ready card binds typed flows and makes no model or timing claim", () => {
  const h = render(base)
  expect(h.host.textContent).toContain("bun test exited 0 in the agent's sandbox at abc · 33 tests")
  expect(h.host.textContent).not.toContain("finished just now")
  const button = [...h.host.querySelectorAll("button")].find((button) => button.textContent === "Open pull request")!
  expect(button.classList.contains("repo-ui-btn-primary")).toBe(true)
  expect(button.dataset.flow).toBe("change.open-pull")
  expect(h.host.querySelector('[data-flow="diff"]')?.textContent).toBe("View diff")
  button.click()
  expect(h.calls).toEqual([["change.open-pull", JSON.stringify({ repo: base.repo, session: base.id })]])
  h.close()
})
test("failed tests, zero tests and no tests never get a filled open button", () => {
  for (const receipt of [
    null,
    { ...base.result!.test_receipt!, exit_code: 1 },
    { ...base.result!.test_receipt!, tests_run: 0 }
  ]) {
    const h = render({ ...base, result: { ...base.result!, test_receipt: receipt } })
    expect(h.host.querySelector("button.repo-ui-btn-primary")).toBeNull()
    expect(h.host.textContent).not.toContain("Checks passed")
    h.close()
  }
})
test("PR is a GitHub link and success copy requires passing tests", () => {
  const h = render({
    ...base,
    pull: {
      landing_number: 12,
      branch: "smithers/landing-12",
      pull_number: 37,
      pull_url: "https://github.com/maya/tinyhttp/pull/37",
      head_commit: "abc",
      tested: true,
      passed: true
    }
  })
  expect(h.host.querySelector("a")?.href).toBe("https://github.com/maya/tinyhttp/pull/37")
  expect(h.host.textContent).toContain(
    "main is unchanged. Your review is next."
  )
  expect(h.host.textContent).not.toContain("Open pull request")
  h.close()
})
test("failed run uses the recorded reason and only offers retry when retryable", () => {
  const h = render({
    ...base,
    phase: "failed",
    session: { ...base.session!, reason: "No machine is free.", retryable: true }
  })
  expect(h.host.querySelector('[role="alert"]')?.textContent).toBe("No machine is free.")
  expect(h.host.querySelector("button")!.dataset.flow).toBe("change.ask")
  h.host.querySelector("button")!.click()
  expect(h.calls).toEqual([["change.ask", JSON.stringify({ repo: base.repo, request: base.request })]])
  h.close()
})
test("GitHub failure keeps the ready card and offers Retry", () => {
  const h = render({ ...base, error: "GitHub couldn't open the pull request. Try again." })
  expect(h.host.textContent).toContain("src/slug.ts")
  expect(h.host.querySelector('[role="alert"]')?.textContent).toContain("GitHub couldn't")
  expect(h.host.querySelector('[role="alert"] button')?.textContent).toBe("Retry")
  h.close()
})

test("stage details have real disclosures, measured durations and no empty controls", () => {
  const h = render({
    ...base,
    activity: "Writing src/slug.ts and its test",
    stages: { Admitted: 1000, "Allocating a machine": 2000, Cloning: 10000, "Model working": 13000, Testing: 71000 }
  })
  const stages = [...h.host.querySelectorAll(".hosted-change-stage")]
  expect(stages[0]?.textContent).toContain("1 s")
  expect(stages[1]?.textContent).toContain("8 s")
  expect(stages[2]?.querySelector("summary")).toBeNull()
  expect(stages[3]?.querySelector("[data-stage-chevron]")).not.toBeNull()
  expect(stages[4]?.querySelector("summary")?.textContent).toContain("Testing")
  expect(h.host.querySelectorAll("[data-stage-chevron]")).toHaveLength(2)
  expect(h.host.querySelector(".hosted-change-file span")?.textContent).toBe("+18")
  h.close()
})
test("a failing test reads as a result to review, not an error, and preserves deletion counts", () => {
  const failing = { ...base.result!, test_receipt: { ...base.result!.test_receipt!, exit_code: 1 } }
  const h = render({ ...base, result: failing, files: [{ path: "src/slug.ts", additions: 18, deletions: 2 }] })
  const result = h.host.querySelector(".hosted-change-test-result")!
  expect([...result.querySelectorAll("p")].map(p => p.textContent)).toEqual([
    "Smithers ran your tests: bun test exited 1 (33 tests).",
    "Review the diff before you open a pull request.",
    "The failure goes in its description."
  ])
  // Each sentence is its own block within the copy rules; the command is the repository's content.
  expect(lintCopy(result)).toEqual([])
  expect(result.querySelector("code[data-content]")?.textContent).toBe("bun test")
  expect(h.host.querySelector(".hosted-change-failure")).toBeNull()
  expect(h.host.querySelector(".hosted-change-chip")?.textContent).toBe("Tests failed")
  expect(h.host.querySelector(".hosted-change-file span")?.textContent).toBe("+18 −2")
  h.close()
  const pr = render({ ...base, result: failing, pull: { landing_number: 1, branch: "change", pull_number: 37,
    pull_url: "https://github.com/maya/tinyhttp/pull/37", head_commit: "abc", tested: true, passed: false } })
  expect(pr.host.textContent).not.toContain("Your review is next")
  pr.close()
})
test("an observed GitHub merge names its person and commit without offering a merge", () => {
  const h = render({
    ...base,
    pull: {
      landing_number: 12,
      branch: "smithers/landing-12",
      pull_number: 37,
      pull_url: "https://github.com/maya/tinyhttp/pull/37",
      head_commit: "abc",
      tested: true,
      passed: true
    },
    merged: { by: "maya", commit: "9c1e2ab" }
  })
  expect(h.host.textContent).toContain("Merged on GitHub by maya. main is now 9c1e2ab.")
  expect(h.host.textContent).not.toContain("main is unchanged")
  expect(h.host.textContent).not.toContain("Merge on GitHub ↗")
  h.close()
})

test("failed Testing has a filled danger dot and the card shell adds no nested padding", () => {
  const style = document.createElement("style")
  style.textContent =
    ":root{--danger:rgb(176,64,40)}" + readFileSync(new URL("HostedChangeCard.css", import.meta.url), "utf8")
  document.head.append(style)
  const h = render({
    ...base,
    result: { ...base.result!, test_receipt: { ...base.result!.test_receipt!, exit_code: 1 } }
  })
  h.host.className = "smithers-card"
  h.host.dataset.kind = "hosted-change"
  try {
    const dot = h.host.querySelector('.hosted-change-stage[data-tone="failed"] i')!
    expect(getComputedStyle(dot).backgroundColor).toBe("rgb(176, 64, 40)")
    expect(getComputedStyle(h.host).padding).toBe("0px")
  } finally {
    h.close()
    style.remove()
  }
})

test("lane A run without optional metadata renders ready without model or duration labels", () => {
  for (const run of [
    { id: 42, status: "success" as const },
    { id: 42, status: "success" as const, model: null, started_at: null, finished_at: null }
  ]) {
    const h = render({ ...base, session: { ...base.session!, run } })
    expect(h.host.textContent).toContain("Open pull request")
    expect(h.host.textContent).not.toContain("finished just now")
    expect(h.host.textContent).not.toContain("took")
    expect(h.host.querySelector(".hosted-change-model")).toBeNull()
    h.close()
  }
})

test("stage duration uses UI font with tabular numbers", () => {
  const style = document.createElement("style")
  style.textContent = readFileSync(new URL("./HostedChangeCard.css", import.meta.url), "utf8")
  document.head.append(style)
  const h = render({ ...base, stages: { Admitted: 1000, "Allocating a machine": 3000 } })
  try {
    const duration = h.host.querySelector(".hosted-change-duration")!
    expect(duration.textContent).toBe("2 s")
    expect(getComputedStyle(duration).whiteSpace).toBe("nowrap")
    expect(getComputedStyle(duration).fontVariantNumeric).toBe("tabular-nums")
  } finally {
    h.close()
    style.remove()
  }
})

test("session-created run has a brand Running chip and completed admission", () => {
 const h = render({ ...base, phase: "running", accepted: false, result: null, stages: { Admitted: 1000 } })
 expect(h.host.querySelector('.hosted-change-chip[data-tone="running"]')?.textContent).toBe("Running")
 expect(h.host.querySelector('.hosted-change-stage[data-tone="done"]')?.textContent).toContain("Admitted")
 h.close()
})
test("running meta wraps only between complete segments", () => {
 const h = render({ ...base, phase: "running", observedAt: 3000, result: null, session: { ...base.session!, run: { id: 1, status: "running", model: "provider:model", started_at: new Date(1000).toISOString(), finished_at: null } } })
 expect([...h.host.querySelectorAll('.hosted-change-meta-segment')].map(node => node.textContent)).toEqual(["provider:model", "started just now", "2 s"])
 h.close()
})

test.each([
  [0, 33, "abc", "bun test exited 0 in the agent's sandbox at abc · 33 tests", true],
  [1, 33, "abc", "bun test exited 1 in the agent's sandbox at abc · 33 tests", false],
  [0, null, "abc", "bun test exited 0 in the agent's sandbox at abc", true],
  [0, 0, "abc", "bun test ran 0 tests in the agent's sandbox", false],
  [0, 33, "drift", "Tests not run at this commit", false],
  [0, 33, null, "Tests not run at this commit", false]
] as const)("sandbox presentation %#", (exit_code, tests_run, commit, text, passed) => {
  const row = { ...base, result: { ...base.result!, test_receipt: commit === null ? null : { ...base.result!.test_receipt!, exit_code, tests_run, commit } } }
  const h = render(row)
  const testing = h.host.querySelectorAll('.hosted-change-stage')[4]!
  expect(testing.textContent).toContain(text)
  expect(testing.getAttribute('data-tone')).toBe(commit !== 'abc' ? 'skipped' : passed ? 'done' : 'failed')
  expect(h.host.textContent).toContain(text)
  expect(h.host.textContent!.toLowerCase()).not.toContain('passed')
  expect(h.host.textContent!.toLowerCase()).not.toContain('verified')
  expect(h.host.querySelector('.hosted-change-detail code')?.textContent ?? null).toBe(commit === 'abc' ? 'bun test' : null)
  expect(h.host.querySelector('.hosted-change-chip')?.textContent).toBe(commit === 'abc' && !passed ? 'Tests failed' : 'Done')
  expect(h.host.querySelector('[data-flow="change.open-pull"]')?.classList.contains('repo-ui-btn-primary')).toBe(passed)
  if (!passed) expect(h.host.textContent).toContain(commit !== 'abc' ? 'Tests not run at this commit' : tests_run === 0 ? 'No tests ran.' : 'Smithers ran your tests: bun test exited 1 (33 tests).')
  h.close()
  const pr = render({ ...row, pull: { landing_number: 1, branch: 'change', pull_number: 37, pull_url: 'https://github.com/maya/tinyhttp/pull/37', head_commit: 'abc', tested: commit === 'abc', passed } })
  expect(pr.host.querySelector('.hosted-change-pull')?.textContent).toContain(`main is unchanged.${passed ? ' Your review is next.' : ''}`)
  expect(pr.host.textContent!.includes('Your review is next.')).toBe(passed)
  expect(pr.host.textContent!.toLowerCase()).not.toContain('passed')
  pr.close()
})

test('completed stage dots use the neutral done color', () => {
 const css = readFileSync(new URL('HostedChangeCard.css', import.meta.url), 'utf8')
 const rule = css.match(/\.hosted-change-stage\[data-tone="done"\][^{]+\{([^}]+)\}/)![1]!
 expect(rule).toContain('background: var(--text-muted)')
 expect(rule).not.toContain('success')
})

for (const receipt of [null, base.result!.test_receipt]) test(`completed empty change shows outcome, receipt ${receipt !== null}`, () => {
 const h = render({ ...base, filesRead: true, files: [], outcome: "I could not edit the files.", result: { ...base.result!, test_receipt: receipt } })
 expect(h.host.textContent).toContain("No change made")
 expect(h.host.textContent).toContain("I could not edit the files.")
 expect(h.host.querySelector('[aria-label="Change diff"]')).toBeNull()
 expect(h.host.textContent).not.toContain("Open pull request")
 expect(h.host.textContent).toContain(receipt ? "bun test exited 0" : "Tests not run at this commit")
 h.close()
})

for (const [reason_code, reason] of [
  ["runtime_offline_unavailable", "Runtime offline execution is unavailable"],
  ["test_env_unavailable", "dependencies not installed in the sandbox"]
]) test(`not-run ${reason_code} stays neutral in both lines`, () => {
  const h = render({ ...base, result: { ...base.result!, test_receipt: null, test_not_run: { reason_code, reason } } })
  const testing = h.host.querySelector('.hosted-change-stage[data-tone="skipped"]')!
  expect(testing.textContent).toContain(`Tests not run: ${reason}`)
  expect(h.host.textContent!.split(`Tests not run: ${reason}`).length).toBeGreaterThanOrEqual(3)
  expect(h.host.querySelector('[data-tone="failed"]')).toBeNull()
  expect(h.host.querySelector('.hosted-change-failure')).toBeNull()
  expect(h.host.textContent).not.toContain("Tests failed")
  expect(h.host.textContent).not.toContain("No test command found")
  h.close()
})

test("box_busy stays live while waiting, then offers the quiet typed Try again", () => {
  const waiting: HostedObservation = { ...base, result: null, phase: "running", busyWaiting: true,
    busyRetries: 2, accepted: false, sessionId: null, session: null, stages: {} }
  const h = render(waiting)
  expect(h.host.textContent).toContain("Starting a machine, please wait…")
  expect(h.host.querySelector('[role="alert"]')).toBeNull()
  expect(h.host.querySelector('[data-tone="live"]')?.textContent).toContain("Allocating a machine")
  expect(h.host.querySelector("button[data-flow='change.ask']")).toBeNull()
  h.update({ ...waiting, phase: "failed", busyWaiting: false, busyRetries: 4,
    error: "The workspace service is busy starting other boxes; try again in a moment." })
  expect(h.host.querySelector('[role="alert"]')?.textContent).toBe("The workspace service is busy starting other boxes; try again in a moment.")
  const retry = h.host.querySelector<HTMLButtonElement>('button[data-flow="change.ask"]')!
  expect(retry.textContent?.trim()).toBe("Try again")
  expect(retry.classList.contains("repo-ui-btn-quiet")).toBe(true)
  expect(retry.classList.contains("repo-ui-btn-primary")).toBe(false)
  retry.click()
  expect(h.calls).toEqual([["change.ask", JSON.stringify({ repo: base.repo, request: base.request })]])
  h.close()
})
test("queued row displays live elapsed time, then restores the allocating label on started or absent stage", () => {
  const queued: HostedObservation = { ...base, phase: "running", result: null,
    session: { ...base.session!, status: "active", stage: "queued", queued_at: "2026-10-19T13:30:00Z" },
    observedAt: Date.parse("2026-10-19T13:31:12Z") }
  const h = render(queued)
  expect(h.host.querySelector('[data-tone="live"]')?.textContent).toContain("Queued: starting soon · 1 min 12 s")
  expect(h.host.querySelector(".hosted-change-duration")?.textContent).toBe(" · 1 min 12 s")
  h.update({ ...queued, observedAt: Date.parse("2026-10-19T13:31:13Z") })
  expect(h.host.textContent).toContain("1 min 13 s")
  for (const stage of ["started", undefined] as const) {
    h.update({ ...queued, session: { ...queued.session!, stage } })
    expect(h.host.textContent).not.toContain("Queued: starting soon")
    expect(h.host.textContent).toContain("Allocating a machine")
  }
  h.close()
})
