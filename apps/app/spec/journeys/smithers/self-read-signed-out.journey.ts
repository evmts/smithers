import { mondayClaim } from "../../mondayClaim"
import { journey } from "../../journey"
export default journey({
  id: "smithers/self-read-signed-out", site: "smithers", spec: "PM L4; smithers/app-spec #6-#8; repo-ui views 1, 2, 7; pm-walk E7",
  world: { base: "default", variant: { as: "out", data: "full", net: "error" } },
  live: { target: "default", subject: { repo: "smithers-canary/smithers", as: "anonymous" } },
  bind: { wholeFile: { read: "GET /api/repos/:repo/contents/PACKAGE.ts", pick: "fileText" } },
  steps: [
    { caption: "Open Smithers", go: "/${repo}", expect: [...mondayClaim,{ see: { role: "button", name: "Files" } }, { text: "README" }] },
    { caption: "Browse files", click: { role: "button", name: "Files" }, expect: [...mondayClaim,{ see: { role: "button", name: "PACKAGE.ts" } }] },
    { caption: "Read the whole TypeScript file", click: { role: "button", name: "PACKAGE.ts" }, expect: [...mondayClaim,{ absent: "Truncated" }, { text: "${wholeFile}" }, { shape: "GET /api/repos/:repo/contents/PACKAGE.ts", schema: "RepoContents" }] },
    { caption: "Read issues honestly", go: "/${repo}/issues", expect: [...mondayClaim,{ see: { role: "alert" } }, { absent: "No open issues" }] }
  ]
})
