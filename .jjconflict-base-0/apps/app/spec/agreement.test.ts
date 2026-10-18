import { expect, test } from "bun:test"
import { agreement, blocks, readLabels, type Label } from "./agreement.ts"
import { claimsHonest } from "./rubrics/claims-honest.ts"
import { readFileSync } from "node:fs"
const policy = JSON.parse(readFileSync(new URL("../../../.smithers/factory.json", import.meta.url), "utf8")).judges
const label = (id: number, passes = 3, thumb: "up" | "down" = "up", seededDefect = false): Label => ({
  journey: "default/repo", step: id, mode: "mock", revision: "revision", thumb, by: "will", at: "2026-10-17T00:00:00Z",
  assertions: [{ rubric: claimsHonest.id, rubricVersion: "1", model: policy.engines.rubric.model, identity: String(id), trials: 3, passes, verdict: passes === 3 ? "pass" : passes === 0 ? "fail" : "uncertain", seededDefect }]
})

test("promotion needs twenty distinct current owner labels, failed seeded defects and 3/3 agreement", () => {
  const labels = Array.from({ length: 20 }, (_, index) => label(index))
  const seeded = label(100, 0, "down", true)
  expect(agreement(claimsHonest, policy, labels).promoted).toBe(false)
  expect(agreement(claimsHonest, policy, [...labels.slice(1), seeded]).promoted).toBe(false)
  expect(agreement(claimsHonest, policy, [...labels, seeded]).promoted).toBe(true)
  expect(agreement(claimsHonest, policy, [...labels, seeded]).pass3).toBe(1)
  const ninety = [...labels.slice(2), label(0, 0), label(1, 0), seeded]
  expect(agreement(claimsHonest, policy, ninety).agreement.accuracy).toBe(0.9)
  expect(agreement(claimsHonest, policy, ninety).promoted).toBe(true)
  expect(agreement(claimsHonest, policy, [...labels.slice(3), label(0, 0), label(1, 0), label(2, 0), seeded]).promoted).toBe(false)
  expect(agreement(claimsHonest, policy, [...labels, label(100, 3, "down", true)]).promoted).toBe(false)
  expect(agreement(claimsHonest, policy, [...labels.slice(1), label(0, 2), seeded]).promoted).toBe(false)
  expect(agreement(claimsHonest, policy, [...labels, ...labels, seeded]).labels).toBe(20)
  expect(agreement(claimsHonest, policy, [...labels.map((entry) => ({ ...entry, by: "agent" })), seeded]).labels).toBe(0)
  expect(agreement({ ...claimsHonest, version: "2" }, policy, [...labels, seeded]).labels).toBe(0)
  expect(agreement(claimsHonest, { ...policy, engines: { ...policy.engines, rubric: { engine: "claude", model: "new" } } }, [...labels, seeded]).labels).toBe(0)
})

test("negative human labels measure consistent rejection with passHatK", () => {
  const report = agreement(claimsHonest, policy, Array.from({ length: 20 }, (_, index) => label(index, 0, "down")).concat(label(100, 0, "down", true)))
  expect(report.pass3).toBe(1)
  expect(report.agreement.accuracy).toBe(1)
  expect(report.promoted).toBe(true)
  expect(agreement(claimsHonest, policy, [label(1, 2)]).agreement.accuracy).toBe(0)
})

test("fixed blocking boundaries keep fuzzy, visual, agent and split votes advisory", () => {
  for (const kind of ["fuzzy", "visual", "agent"] as const) expect(blocks(kind, "fail", true)).toBe(false)
  expect(blocks("rubric", "fail", false)).toBe(false)
  expect(blocks("rubric", "fail", true)).toBe(true)
  expect(blocks("rubric", "uncertain", true)).toBe(false)
  expect(blocks("exact", "fail")).toBe(true)
  expect(blocks("shape", "fail")).toBe(true)
})

test("missing label file yields zero labels without invention", async () => {
  expect(await readLabels(new URL("./labels/missing.jsonl", import.meta.url).pathname)).toEqual([])
})

test("agreement CLI reads label files and prints both rubrics", async () => {
  const child = Bun.spawn([process.execPath, new URL("./agreementCli.ts", import.meta.url).pathname, new URL("../../../.smithers/factory.json", import.meta.url).pathname, new URL("./labels", import.meta.url).pathname], { stdout: "pipe", stderr: "pipe" })
  const reports = (await new Response(child.stdout).text()).trim().split("\n").map((line) => JSON.parse(line))
  expect(await child.exited).toBe(0)
  expect(reports.map((report) => [report.rubric, report.labels, report.promoted])).toEqual([["claims-honest", 0, false], ["reply-actionable", 0, false]])
})

test("fuzzy labels cannot promote a rubric even when model and rubric match", () => {
  const fuzzy = Array.from({ length: 20 }, (_, index) => label(index)).concat(label(100, 0, "down", true)).map(entry => ({ ...entry, assertions: entry.assertions.map(assertion => ({ ...assertion, kind: "fuzzy" as const })) }))
  expect(agreement(claimsHonest, policy, fuzzy)).toMatchObject({ labels: 0, promoted: false })
})
