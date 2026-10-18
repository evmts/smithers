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
    close: () => {
      flushSync(() => root.unmount())
      host.remove()
    }
  }
}
test("ready card binds typed flows and makes no model or timing claim", () => {
  const h = render(base)
  expect(h.host.textContent).toContain("bun test exited 0 · 33 tests passed")
  expect(h.host.textContent).not.toContain("finished just now")
  const button = [...h.host.querySelectorAll("button")].find((button) => button.textContent === "Open pull request")!
  expect(button.classList.contains("repo-ui-btn-primary")).toBe(true)
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
    "main is unchanged. In the sandbox, bun test exited 0 · 33 tests passed. Your review is next."
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
test("failed-test sentence highlights only the outcome and preserves deletion counts", () => {
  const h = render({
    ...base,
    result: { ...base.result!, test_receipt: { ...base.result!.test_receipt!, exit_code: 1 } },
    files: [{ path: "src/slug.ts", additions: 18, deletions: 2 }]
  })
  expect(h.host.querySelector(".hosted-change-failure")?.textContent).toBe("Tests failed (exit 1).")
  expect(h.host.querySelector(".hosted-change-failure")?.parentElement?.textContent).toBe(
    "Tests failed (exit 1). You can still open a pull request; the failure goes in its description."
  )
  expect(h.host.querySelector(".hosted-change-file span")?.textContent).toBe("+18 −2")
  h.close()
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
