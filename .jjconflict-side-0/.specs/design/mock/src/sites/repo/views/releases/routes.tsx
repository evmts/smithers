/* Family route registry: add routes here; repo/routes.tsx includes this list automatically. */
import type { Route } from "../../../core/router"
import { Releases } from "./Releases"

const screen = (id: string, path: string, query: string, label: string) => {
  const flags = new URLSearchParams("as=in&role=member&net=ok&data=full")
  new URLSearchParams(query).forEach((value, key) => flags.set(key, value))
  return { id: `releases-${id}`, route: `smithers.sh/maya/tinyhttp/${path}?${flags}`, label }
}

export const routes: Route[] = [
  {
    pattern: "smithers.sh/:owner/:repo/releases/tag/:tag",
    name: "Repository · Release",
    render: context => <Releases tag={context.params.tag} />,
    screens: [
      screen("tag-latest", "releases/tag/v0.4.2", "", "Release · latest"),
      screen("tag-older", "releases/tag/v0.4.0", "", "Release · older"),
      screen("tag-not-found", "releases/tag/v9.9.9", "", "Release · not found"),
      screen("tag-loading", "releases/tag/v0.4.2", "net=slow", "Release · loading"),
      screen("tag-error", "releases/tag/v0.4.2", "net=error", "Release · error")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/releases",
    name: "Repository · Releases",
    render: () => <Releases />,
    screens: [
      screen("list", "releases", "", "Releases"),
      screen("empty", "releases", "data=empty", "Releases · empty"),
      screen("loading", "releases", "net=slow", "Releases · loading"),
      screen("error", "releases", "net=error", "Releases · error"),
      screen("draft", "releases", "draft=1", "Release · draft form"),
      screen("draft-denied", "releases", "draft=1&role=reader", "Release · membership required"),
      screen("draft-signed-out", "releases", "draft=1&as=out", "Release · sign-in required"),
      screen("signed-out", "releases", "as=out", "Releases · signed out"),
      screen("reader", "releases", "role=reader", "Releases · reader")
    ]
  }
]
