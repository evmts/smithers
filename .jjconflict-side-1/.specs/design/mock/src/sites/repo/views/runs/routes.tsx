import type { Route, Screen } from "../../../core/router"
import { Approvals } from "./Approvals"
import { Run } from "./Run"
import { Runs } from "./Runs"

const screen = (id: string, path: string, label: string, flags = ""): Screen => {
  const [pathname, search] = path.split("?")
  const query = new URLSearchParams("as=in&role=member&landing=open&host=hosted&net=ok&data=full&still=1")
  for (const [key, value] of new URLSearchParams(search)) query.set(key, value)
  for (const [key, value] of new URLSearchParams(flags)) query.set(key, value)
  return {
    id: `runs-${id}`,
    route: `smithers.sh/maya/tinyhttp/${pathname}?${query}`,
    label,
    site: "default",
    ...(flags.includes("net=slow") ? { wait: 100 } : {})
  }
}

export const routes: Route[] = [
  {
    pattern: "smithers.sh/:owner/:repo/runs/:id",
    name: "Repository run",
    render: ({ params }) => <Run id={params.id} />,
    screens: [
      screen("run-running", "runs/run-512", "Run · implementing"),
      screen("run-waiting", "runs/run-511", "Run · owner decision"),
      screen("run-waiting-cora", "runs/run-506", "Run · waiting on another member"),
      screen("run-failed", "runs/run-510", "Run · failed with retry"),
      screen("run-resumed", "runs/run-509", "Run · resumed from checkpoint"),
      screen("run-succeeded", "runs/run-507", "Run · pull and landed commit"),
      screen("run-cancelled", "runs/run-508", "Run · cancelled"),
      screen("run-cancel-confirm", "runs/run-512?confirm=cancel", "Run · confirm cancellation"),
      screen("run-retry-confirm", "runs/run-510?confirm=retry", "Run · confirm retry"),
      screen("run-approval-confirm", "runs/run-511?confirm=approval&approval=approval-cors", "Run · confirm decision"),
      screen("run-graph", "runs/run-512?view=graph", "Run · flow graph"),
      screen("run-trace", "runs/run-511?view=trace", "Run · trace"),
      screen("run-reader", "runs/run-511", "Run · reader cannot approve", "role=reader"),
      screen("run-signed-out", "runs/run-512", "Run · public read-only", "as=out"),
      screen("run-held-retry", "runs/run-510", "Run · retry on a local install", "landing=install"),
      screen("run-loading", "runs/run-512", "Run · loading", "net=slow"),
      screen("run-error", "runs/run-512", "Run · connection failed", "net=error"),
      screen("run-empty", "runs/run-512", "Run · not found", "data=empty")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/approvals",
    name: "Repository approvals",
    render: () => <Approvals />,
    screens: [
      screen("approvals", "approvals", "Approvals · waiting on you"),
      screen("approvals-everyone", "approvals?filter=everyone", "Approvals · everyone"),
      screen("approvals-empty", "approvals", "Approvals · nothing waiting", "data=empty"),
      screen("approvals-signed-out", "approvals", "Approvals · sign in", "as=out"),
      screen("approvals-reader", "approvals", "Approvals · reader", "role=reader"),
      screen("approvals-loading", "approvals", "Approvals · loading", "net=slow"),
      screen("approvals-error", "approvals", "Approvals · unavailable", "net=error")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/runs",
    name: "Repository runs",
    render: () => <Runs />,
    screens: [
      screen("all", "runs", "Runs · all"),
      screen("waiting", "runs?filter=waiting", "Runs · waiting on you"),
      screen("failed", "runs?filter=failed", "Runs · failed"),
      screen("flow-filter", "runs?flow=implement-issue", "Runs · one flow"),
      screen("empty", "runs", "Runs · no runs", "data=empty"),
      screen("loading", "runs", "Runs · loading", "net=slow"),
      screen("error", "runs", "Runs · unavailable", "net=error"),
      screen("signed-out", "runs", "Runs · signed out", "as=out"),
      screen("active", "runs?filter=active", "Runs · active"),
      screen("succeeded", "runs?filter=succeeded", "Runs · succeeded")
    ]
  }
]
