// The browser's dispatch records (docs/features/flows.md#observability) reach ChatApi's telemetry relay with their
// fields, and nothing else of the export: never a flow's input.
import { Stream } from "effect"
import { expect, test } from "vitest"
import { harness, recorded, testFile } from "./test/harness.ts"

const runtime = testFile("flow_telemetry")

const resource = { attributes: [{ key: "service.name", value: { stringValue: "smithers-mvp-web" } }] }
const attribute = (key: string, stringValue: string) => ({ key, value: { stringValue } })

test("relays flow.dispatch with its flow, door, outcome and execution id, and drops the rest", async () => {
  const h = await harness(runtime, () => Stream.empty)
  const body = JSON.stringify({
    resourceLogs: [{
      resource,
      scopeLogs: [{
        logRecords: [{
          severityNumber: 9,
          body: { stringValue: "flow.dispatch" },
          attributes: [
            attribute("flow", "app/theme/set"),
            attribute("door", "button"),
            attribute("outcome", "done"),
            attribute("executionId", "e-1"),
            attribute("mode", "SENTINEL-flow-input"),
          ],
        }],
      }],
    }],
  })

  const response = await h.fetch("/api/telemetry/v1/logs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  })

  expect(response.status).toBe(200)
  expect(h.logs.filter((log) => log.message === "flow.dispatch")).toMatchObject([
    {
      annotations: {
        flow: "app/theme/set",
        door: "button",
        outcome: "done",
        executionId: "e-1",
        "otlp.signal": "logs",
      },
    },
  ])
  expect(recorded(h)).not.toContain("SENTINEL")
})
