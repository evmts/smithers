import { mondayClaim } from "../../mondayClaim"
import { journey } from "../../journey"
export default journey({
  id: "effeck/repo-read-signed-out", site: "effeck", spec: "PM L3; effeck/app-spec home.json; repo-ui view 2; pm-walk E8",
  world: { base: "default", variant: { as: "out", converter: "off" } },
  live: { target: "default", subject: { repo: "effeck/effeck", as: "anonymous" } },
  bind: { wholeFile: { read: "GET /api/repos/:repo/contents/docs/user/src/001-onboarding.md", pick: "fileText" } },
  steps: [
    { caption: "Read Effeck home", go: "/${repo}", expect: [...mondayClaim,{ see: { role: "link", name: "Install Effeck" } }, { see: { role: "link", name: "Docs" } }, { text: "README" }] },
    { caption: "Read the whole Docs file", click: { role: "link", name: "Docs" }, expect: [...mondayClaim,{ absent: "Truncated" }, { text: "${wholeFile}" }, { shape: "GET /api/repos/:repo/contents/docs/user/src/001-onboarding.md", schema: "RepoContents" }] }
  ]
})
