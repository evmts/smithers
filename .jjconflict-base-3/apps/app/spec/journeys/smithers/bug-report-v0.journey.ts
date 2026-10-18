import { mondayClaim } from "../../mondayClaim"
import { journey } from "../../journey"
export default journey({
  id: "smithers/bug-report-v0", site: "smithers", spec: "PM L5; smithers/app-spec #9",
  world: { base: "default", variant: { as: "out" } },
  live: { target: "default", subject: { as: "anonymous" } },
  bind: { build: { read: "GET /api/bootstrap", pick: "buildSha" } },
  steps: [{ caption: "Inspect the public report destination without opening GitHub", go: "/bug?repo=private-canary%2Fsecret-repository", expect: [...mondayClaim,
    { url: { startsWith: "https://github.com/smithersai/smithers/issues/new?", includes: ["body=", "route", "${build}", "correlation"], matches: "correlation(?: id)?\\s*[:=]\\s*[^\\s]+", absent: ["private-canary/secret-repository"] }, on: { role: "link", name: "Publish on GitHub" } }
  ] }]
})
