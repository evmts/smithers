import { mondayClaim } from "../../mondayClaim"
import { journey } from "../../journey"
export default journey({
  id: "default/repo-read-signed-out", site: "default", spec: "PM D1; repo-ui-spec header, view 1",
  lifecycle: "evergreen", world: { base: "default", variant: { as: "out", data: "full", net: "ok" } },
  live: { target: "default", subject: { repo: "smithers-canary/smithers", as: "anonymous" } },
  bind: { readme: { read: "GET /api/repos/:repo/contents/README.md", pick: "firstHeading" } },
  steps: [
    { caption: "Open the public repository", go: "/${repo}", expect: [...mondayClaim,
      ...["Code", "Issues", "Pull requests", "Runs", "Flows", "Wiki"].map(name => ({ see: { role: "link", name } })),
      { see: { role: "link", name: "Settings" }, count: 0 },
      { see: { role: "button", name: "Ask" } },
      { text: "${readme}" }
    ] },
    { caption: "Browse repository files", spec: "PM D1; repo-ui-spec view 1", go: "/${repo}/tree/main", expect: [...mondayClaim, { see: { role: "button", name: "README.md" } }] },
    { caption: "Read the README", spec: "PM D1; repo-ui-spec view 1", click: { role: "button", name: "README.md" }, expect: [...mondayClaim,
      { see: { role: "region", name: "README.md" }, text: "${readme}" }, { sent: "GET /api/repos/${repo}/contents/README.md" }, { shape: "GET /api/repos/${repo}/contents/README.md", schema: "RepoContents" }
    ] }
  ]
})
