import { defaultWorld } from "./worlds/default"
import { readRoutes } from "./routes/reads"
import { matchRoute } from "./route"

/** Decode every declared response for every data/identity variant before bundling. */
export const validateFixtures = () => {
  let checked = 0
  for (const as of ["out", "member"]) for (const data of ["full", "empty"]) {
    const w = defaultWorld(new URLSearchParams({ as, data }))
    for (const route of readRoutes) for (const repo of w.repos) {
      const [owner = "", name = ""] = repo.name.split("/")
      const paths = route.path.includes("*path") ? [...Object.keys(repo.files), "src", "docs", "not-present", ".smithers/factory.json"] : [""]
      for (const path of paths) {
        const concrete = route.path.replace(":owner", owner).replace(":repo", name).replace("*path", path)
        const params = matchRoute(route.path, concrete)!
        for (const query of ["", "?state=open", "?state=closed"]) {
          const response = route.handle({ url: new URL(concrete + query, "http://spec.test"), params }, w)
          route.schema.parse(response.body)
          checked++
        }
      }
    }
  }
  return checked
}
if (import.meta.main) console.log(`spec fixtures: ${validateFixtures()} responses decoded`)
