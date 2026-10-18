// Run with node --test .specs/design/mock/src/sites/repo/views/pulls/review-fixes.test.mjs.
// Server rendering checks the real views without launching the browser reserved for screenshot review.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = fileURLToPath(new URL("../../../../../", import.meta.url))
const require = createRequire(new URL("../../../../../package.json", import.meta.url))
const { build } = require("esbuild")
const result = await build({
  stdin: {
    contents: `
      import { createElement } from "react"
      import { renderToStaticMarkup } from "react-dom/server"
      import { selectRepo, pull, run } from "./src/sites/repo/fixtures"
      import { PullReady } from "./src/sites/repo/views/pulls/PullPage"
      import { RunReady } from "./src/sites/repo/views/runs/Run"
      import { RunStarted } from "./src/sites/repo/views/runs/shared"
      export { reviewIsNext } from "./src/sites/repo/views/pulls/shared"
      export const handoffPull = () => pull(34)
      export { stackCheckSummary } from "./src/sites/repo/views/pulls/Stack"
      selectRepo("maya/tinyhttp")
      export const renderPull = () => renderToStaticMarkup(createElement(PullReady, { initial: pull(34), tab: "files" }))
      export const waitingRun = run("run-511")
      export const renderRun = () => renderToStaticMarkup(createElement(RunReady, { id: "run-511" }))
      export const renderStarted = () => renderToStaticMarkup(createElement(RunStarted, { date: run("run-511").started }))
    `,
    resolveDir: root, loader: "tsx"
  },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  external: ["react", "react/*", "react-dom", "react-dom/*"],
  nodePaths: [fileURLToPath(new URL("../../../apps/app/node_modules", `file://${root}`))],
  plugins: [{
    name: "server-router-snapshot",
    setup(builder) {
      // The hash router has no server snapshot. Supply its existing read function for this render-only test.
      builder.onLoad({ filter: /core\/router\.tsx$/ }, async ({ path }) => ({
        contents: (await readFile(path, "utf8")).replace(
          "useSyncExternalStore(subscribe, read)", "useSyncExternalStore(subscribe, read, read)"
        ),
        loader: "tsx"
      }))
    }
  }],
  logLevel: "silent"
})

globalThis.window = {
  location: { hash: "#/smithers.sh/maya/tinyhttp/pull/34/files", search: "?still=1" },
  addEventListener() {}
}
globalThis.sessionStorage = { getItem() { return null } }
const module = { exports: {} }
new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports)
const { renderPull, renderRun, renderStarted, waitingRun, stackCheckSummary, reviewIsNext, handoffPull } = module.exports

test("Stack reports check evidence without an agent verdict", () => {
  for (const [states, expected] of [[[], "Check evidence unavailable"], [["success"], "Checks passed"], [["success", "pending"], "Checks incomplete"], [["success", "failure"], "Checks failed"], [["skipped"], "Checks incomplete"]]) {
    assert.equal(stackCheckSummary(states.map(state => ({ name: "check", state }))), expected)
  }
})

test("pull attribution names the run, person and harness once", () => {
  const header = renderPull().match(/<div class="repo-pulls-agent-context">([\s\S]*?)<\/div>/)?.[1]
  assert.ok(header)
  assert.equal((header.match(/Codex/g) ?? []).length, 1)
  assert.equal((header.match(/gpt-6\.1-sol/g) ?? []).length, 1)
  assert.doesNotMatch(header, /for maya/)
  assert.equal((renderPull().match(/for maya/g) ?? []).length, 1)
  assert.match(header, /runs\/run-511">run-511<\/a>/)
})

test("hunk rows stay unselected when no numeric line is selected", () => {
  const hunks = [...renderPull().matchAll(/<div role="row" class="repo-pulls-diff-line repo-pulls-diff-hunk"[^>]*>/g)]
  assert.ok(hunks.length > 0)
  assert.ok(hunks.every(([row]) => !row.includes("data-selected")))
})

test("run start time is relative with a full UTC tooltip", () => {
  assert.match(renderStarted(), /Started 47 minutes ago/)
  assert.match(renderStarted(), /title="2026-10-17 20:13:00 UTC"/)
})

test("waiting approval preserves its recorded stage labels and state", () => {
  window.location.hash = "#/smithers.sh/maya/tinyhttp/runs/run-511?still=1"
  const html = renderRun()
  assert.match(html, /Choose the CORS configuration policy/)
  for (const stage of waitingRun.stages) assert.ok(html.includes(stage.label), `Shows recorded stage: ${stage.label}`)
  assert.ok(html.includes(waitingRun.stages.find(stage => stage.state === "waiting").summary))
  assert.match(html, /no changes will be published while this decision is pending/)
  assert.doesNotMatch(html, /failed, retried/i)
})

// Review ownership, checks and lifecycle must all hold at once.
test("review handoff requires an open agent PR and the viewer's outstanding review", () => {
  const base={...handoffPull(),state:"open",checks:[{name:"test",state:"success"}],reviewers:["maya"],reviews:[]}
  assert.equal(reviewIsNext(base),true)
  for(const state of ["draft","closed","merged"])assert.equal(reviewIsNext({...base,state}),false)
  for(const state of ["pending","failure","skipped"])assert.equal(reviewIsNext({...base,checks:[{name:"test",state}]}),false)
  assert.equal(reviewIsNext({...base,checks:[]}),false)
  assert.equal(reviewIsNext({...base,agent:undefined}),false)
  assert.equal(reviewIsNext({...base,reviewers:["cora"]}),false)
  assert.equal(reviewIsNext({...base,reviewers:[]}),true)
  assert.equal(reviewIsNext({...base,reviewers:[],agent:{...base.agent,for:"cora"}}),false)
  assert.equal(reviewIsNext({...base,reviewers:[],reviews:[{author:"maya",state:"approved"}]}),false)
  for(const state of ["approved","changes_requested"])assert.equal(reviewIsNext({...base,reviews:[{author:"maya",state}]}),false)
  assert.equal(reviewIsNext({...base,reviews:[{author:"maya",state:"commented"}]}),true)
  assert.equal(reviewIsNext({...base,reviews:[{author:"cora",state:"approved"}]}),true)
})
