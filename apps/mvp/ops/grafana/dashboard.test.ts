// The flow usage dashboard (ops/grafana/flow-usage.json, ops/grafana/README.md) reads only what the app records: every
// log line a panel filters on is one the telemetry relay keeps (src/telemetry.ts) or ChatApi writes itself, and every
// field it parses is one those lines carry. A renamed record or field fails here, not as an empty panel.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { FLOWS_TELEMETRY } from "../../src/flows/contract"
import { BROWSER_TELEMETRY } from "../../src/telemetry"

interface Target {
  readonly refId: string
  readonly expr: string
  readonly datasource: { readonly uid: string }
}
interface Panel {
  readonly title: string
  readonly datasource: { readonly type: string; readonly uid: string }
  readonly targets: ReadonlyArray<Target>
}
interface Dashboard {
  readonly uid: string
  readonly panels: ReadonlyArray<Panel>
  readonly templating: { readonly list: ReadonlyArray<{ readonly name: string; readonly query: string }> }
}

const dashboard = JSON.parse(readFileSync(join(import.meta.dirname, "flow-usage.json"), "utf8")) as Dashboard
const targets = dashboard.panels.flatMap((panel) => panel.targets.map((target) => ({ panel: panel.title, ...target })))

/** ChatApi's own model endpoint line (docs/observability.md#spend-alerts) and the fields the dashboard reads from it. */
const SPEND = { record: "model.spend", fields: ["role", "tokens", "costUsd"] }

describe("the flow usage dashboard", () => {
  test("has the panels Will asked for, each on the Loki data source variable", () => {
    expect(dashboard.uid).toBe("smithers-flow-usage")
    expect(dashboard.panels.map((panel) => panel.title)).toEqual([
      "Top flows by runs",
      "Success rate by flow",
      "Duration p50 and p95 by flow",
      "Doors",
      "Placements",
      "Failures by code",
      "Model tokens by flow",
      "Metered tokens and spend by role",
    ])
    for (const panel of dashboard.panels) expect(panel.datasource, panel.title).toEqual({ type: "loki", uid: "${datasource}" })
    for (const target of targets) expect(target.datasource.uid, target.panel).toBe("${datasource}")
    expect(dashboard.templating.list.map((variable) => variable.name)).toEqual(["datasource", "stream"])
  })

  test("every query reads the stream variable over the dashboard's range, and drops lines it can't parse", () => {
    for (const target of targets) {
      expect(target.expr, target.panel).toMatch(/\$stream \|= "/)
      expect(target.expr, target.panel).toContain("[$__range]")
      expect(target.expr, target.panel).toContain('| json ')
      expect(target.expr, target.panel).toContain('| __error__=""')
    }
  })

  test("filters only on lines the app records, and parses only fields they carry", () => {
    const records = new Set<string>([...FLOWS_TELEMETRY.records, SPEND.record])
    const fields = new Set<string>([...BROWSER_TELEMETRY.fields, ...SPEND.fields])
    for (const target of targets) {
      const filters = [...target.expr.matchAll(/\|= "([^"]+)"/g)].map((match) => match[1]!)
      expect(filters.length, target.panel).toBeGreaterThan(0)
      for (const record of filters) expect(records, `${target.panel}: ${record}`).toContain(record)
      for (const [, field] of target.expr.matchAll(/="annotations\.([A-Za-z]+)"/g)) {
        expect(fields, `${target.panel}: ${field}`).toContain(field)
      }
    }
    // The usage lines the engine writes (@smthrs/flow RunMetrics) are the ones the dashboard reads.
    expect(new Set(targets.flatMap((target) => [...target.expr.matchAll(/\|= "([^"]+)"/g)].map((match) => match[1]))))
      .toEqual(new Set(["flow.run.started", "flow.run.settled", "flow.model.call", "model.spend"]))
  })
})
