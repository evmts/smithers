import type { Route, Screen } from "../../../core/router"
import { Wiki } from "./Wiki"

const screen = (id: string, path: string, label: string, flags = ""): Screen => {
  const [pathname, search] = path.split("?")
  const query = new URLSearchParams("as=in&role=member&landing=open&host=hosted&net=ok&data=full")
  for (const [key, value] of new URLSearchParams(search)) query.set(key, value)
  for (const [key, value] of new URLSearchParams(flags)) query.set(key, value)
  return { id: `wiki-${id}`, route: `smithers.sh/maya/tinyhttp/${pathname}?${query}`, label, site: "default", ...(flags.includes("net=slow") ? { wait: 100 } : {}) }
}

export const routes: Route[] = [
  {
    pattern: "smithers.sh/:owner/:repo/wiki/:page",
    name: "Repository wiki page",
    render: ({ params }) => <Wiki slug={params.page} />,
    screens: [
      screen("github-home", "wiki/Home", "Wiki · GitHub Home path", "as=out"),
      screen("person", "wiki/release-process", "Wiki · Written by a person"),
      screen("proposal", "wiki/middleware-order", "Wiki · Run inference and proposal"),
      screen("proposal-confirm", "wiki/middleware-order?accept=run-511", "Wiki · Confirm proposal"),
      screen("edit", "wiki/architecture?edit=1", "Wiki · Markdown editor"),
      screen("preview", "wiki/architecture?edit=1&preview=1", "Wiki · Markdown preview"),
      screen("history", "wiki/architecture?history=1", "Wiki · Revision history"),
      screen("not-found", "wiki/missing-page", "Wiki · Not found"),
      screen("page-loading", "wiki/architecture", "Wiki · Page loading", "net=slow"),
      screen("page-error", "wiki/architecture", "Wiki · Page read failed", "net=error"),
      screen("signed-out", "wiki/middleware-order", "Wiki · Signed out", "as=out"),
      screen("reader", "wiki/middleware-order", "Wiki · Reader", "role=reader"),
      screen("edit-denied", "wiki/architecture?edit=1", "Wiki · Edit denied", "role=reader"),
      screen("edit-signed-out", "wiki/architecture?edit=1", "Wiki · Sign in to edit", "as=out")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/wiki",
    name: "Repository wiki",
    render: () => <Wiki />,
    screens: [
      screen("home", "wiki", "Wiki · Home"),
      screen("empty", "wiki", "Wiki · Empty", "data=empty"),
      screen("new", "wiki?new=1", "Wiki · New page", "data=empty"),
      screen("loading", "wiki", "Wiki · Loading", "net=slow"),
      screen("error", "wiki", "Wiki · Read failed", "net=error"),
      screen("home-signed-out", "wiki", "Wiki · Public read only", "as=out"),
      screen("home-reader", "wiki", "Wiki · Read only member acts", "role=reader")
    ]
  }
]
