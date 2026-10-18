/** Registration evidence only: execute each self-contained build in an isolated
 * VM until __SITE__ is assigned, without a DOM, React mount, browser or network.
 * node evals/mock-fidelity/screen-map.mjs [dist-default-ui ...] > screen-map.json
 * Re-run after rebuilding a dist; this is not rendered inspection evidence. */
import { readFileSync } from "node:fs"
import { appliesToSite, screensFor, statesFor, requiredStatesFor, registrationProblemsFor } from "./scoring.ts"
import { registrationFor, htmlSha256For, defaultDists } from "./registration.ts"

const views = JSON.parse(readFileSync(new URL("./views.json", import.meta.url), "utf8"))
const mapping = Object.fromEntries((process.argv.slice(2).length ? process.argv.slice(2) : defaultDists).map(dist => {
  const site = registrationFor(dist)
  return [dist, { site: site.site, htmlSha256: htmlSha256For(dist), evidence: "registration only; no DOM or browser", specVersion: "2.1", registrationProblems: registrationProblemsFor(site), cases: Object.fromEntries(views.map(view => [view.id, {
    applies: appliesToSite(view, site), screenIds: screensFor(view, site).map(screen => screen.id), states: statesFor(view, site), requiredStates: requiredStatesFor(view, site)
  }])) }]
}))
console.log(JSON.stringify(mapping, null, 2))
