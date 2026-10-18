/* Family route registry: add routes here; repo/routes.tsx includes this list automatically. */
import type { Route } from "../../../core/router"
import { Docs } from "./Docs"

const screen = (id: string, path: string, query: string, label: string) => {
  const flags = new URLSearchParams("as=in&role=member&net=ok&data=full")
  new URLSearchParams(query).forEach((value, key) => flags.set(key, value))
  return { id: `docs-${id}`, route: `smithers.sh/maya/tinyhttp/${path}?${flags}`, label }
}

export const routes: Route[] = [
  {
    pattern: "smithers.sh/:owner/:repo/docs",
    name: "Repository · Docs",
    render: () => <Docs />,
    screens: [
      screen("first-page", "docs", "", "Docs · getting started"),
      screen("loading", "docs", "net=slow", "Docs · loading"),
      screen("error", "docs", "net=error", "Docs · error"),
      screen("empty", "docs", "data=empty", "Docs · empty"),
      screen("signed-out", "docs", "as=out", "Docs · signed out"),
      screen("reader", "docs", "role=reader", "Docs · reader"),
      screen("phone", "docs", "", "Docs · phone")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/docs/*",
    name: "Repository · Docs page",
    render: context => <Docs path={context.params["*"]} />,
    screens: [
      screen("routing", "docs/routing", "", "Docs · routing"),
      screen("not-found", "docs/no-such-page", "", "Docs · not found"),
      screen("outline", "docs/adapters", "", "Docs · page outline"),
      screen("anchor", "docs/adapters", "section=node", "Docs · heading anchor")
    ]
  }
]
