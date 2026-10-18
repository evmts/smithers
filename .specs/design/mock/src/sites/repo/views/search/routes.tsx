/* Family route registry: add routes here; repo/routes.tsx includes this list automatically. */
import type { Route } from "../../../core/router"
import { Search } from "./Search"

const screen = (id: string, query: string, label: string) => {
  const flags = new URLSearchParams("as=in&role=member&net=ok&data=full")
  new URLSearchParams(query).forEach((value, key) => flags.set(key, value))
  return { id: `search-${id}`, route: `smithers.sh/maya/tinyhttp/search?${flags}`, label }
}

export const routes: Route[] = [{
  pattern: "smithers.sh/:owner/:repo/search",
  name: "Repository · Search",
  render: () => <Search />,
  screens: [
    screen("empty-query", "", "Search · empty query"),
    screen("code", "q=router&type=code", "Search · code"),
    screen("issues", "q=query&type=issues", "Search · issues"),
    screen("runs", "q=query&type=runs", "Search · run logs"),
    screen("commits", "q=query&type=commits", "Search · commits"),
    screen("pulls", "q=headers&type=pulls", "Search · pull requests"),
    screen("wiki", "q=router&type=wiki", "Search · wiki"),
    screen("docs", "q=router&type=docs", "Search · docs"),
    screen("no-results", "q=unfindable-platypus", "Search · no results"),
    screen("symbol", "q=symbol%3ARouter", "Search · symbols"),
    screen("references", "q=ref%3AparseQuery", "Search · references"),
    screen("loading", "q=router&net=slow", "Search · loading"),
    screen("error", "q=router&net=error", "Search · error"),
    screen("empty", "q=router&data=empty", "Search · empty repository"),
    screen("signed-out", "q=router&as=out", "Search · signed out"),
    screen("reader", "q=router&role=reader", "Search · reader")
  ]
}]
