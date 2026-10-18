import type { Route, Screen } from "../../../core/router"
import { Agents } from "./Agents"
import { Flow } from "./Flow"
import { Flows } from "./Flows"

const screen = (id: string, path: string, label: string, flags = ""): Screen => {
  const [pathname, search] = path.split("?")
  const query = new URLSearchParams("as=in&role=member&landing=open&host=hosted&hosted=up&model=connected&net=ok&data=full")
  for (const [key, value] of new URLSearchParams(search)) query.set(key, value)
  for (const [key, value] of new URLSearchParams(flags)) query.set(key, value)
  return { id: `flows-${id}`, route: `smithers.sh/maya/tinyhttp/${pathname}?${query}`, label, site: "default", ...(flags.includes("net=slow") ? { wait: 100 } : {}) }
}

export const routes: Route[] = [
  {
    pattern: "smithers.sh/:owner/:repo/flows/:name",
    name: "Repository flow",
    render: ({ params }) => <Flow name={params.name} />,
    screens: [
      screen("overview", "flows/implement-issue", "Flow · Overview"),
      screen("source", "flows/implement-issue?tab=source", "Flow · Source"),
      screen("runs", "flows/implement-issue?tab=runs", "Flow · Runs"),
      screen("run-form", "flows/implement-issue?run=1", "Flow · Run inputs"),
      screen("run-confirm", "flows/implement-issue?run=1&confirm=1", "Flow · Confirm run"),
      screen("held", "flows/implement-issue?run=1", "Flow · Code changes held", "landing=install"),
      screen("paused", "flows/implement-issue?run=1", "Flow · Hosted machines paused", "hosted=paused"),
      screen("loading", "flows/implement-issue", "Flow · Loading", "net=slow"),
      screen("error", "flows/implement-issue", "Flow · Read failed", "net=error"),
      screen("empty", "flows/implement-issue", "Flow · Empty", "data=empty"),
      screen("not-found", "flows/missing-flow", "Flow · Not found"),
      screen("signed-out", "flows/implement-issue", "Flow · Public read only", "as=out"),
      screen("run-signed-out", "flows/implement-issue?run=1", "Flow · Sign in to run", "as=out"),
      screen("reader", "flows/implement-issue", "Flow · Reader", "role=reader"),
      screen("run-denied", "flows/implement-issue?run=1", "Flow · Run denied", "role=reader")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/agents",
    name: "Repository agents",
    render: () => <Agents />,
    screens: [
      screen("agents", "agents", "Agents"),
      screen("agents-disconnected", "agents", "Agents · Codex not connected", "model=none"),
      screen("agents-loading", "agents", "Agents · Loading", "net=slow"),
      screen("agents-error", "agents", "Agents · Read failed", "net=error"),
      screen("agents-empty", "agents", "Agents · Empty", "data=empty"),
      screen("agents-signed-out", "agents", "Agents · Public read only", "as=out"),
      screen("agents-reader", "agents", "Agents · Reader", "role=reader")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/flows",
    name: "Repository flows",
    render: () => <Flows />,
    screens: [
      screen("list", "flows", "Flows"),
      screen("list-empty", "flows", "Flows · Empty", "data=empty"),
      screen("list-loading", "flows", "Flows · Loading", "net=slow"),
      screen("list-error", "flows", "Flows · Read failed", "net=error"),
      screen("list-signed-out", "flows", "Flows · Signed out", "as=out"),
      screen("list-reader", "flows", "Flows · Reader", "role=reader"),
      screen("list-run", "flows?run=1", "Flows · Pick a flow")
    ]
  }
]
