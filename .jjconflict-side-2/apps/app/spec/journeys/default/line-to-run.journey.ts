import { journey } from "../../journey"
import { mondayClaim } from "../../mondayClaim"
export default journey({
  id: "default/line-to-run",
  site: "default",
  lifecycle: "evergreen",
  spec: "PM D3; repo-ui-spec views 3-5, 9",
  world: { base: "default", variant: { as: "out", data: "full", net: "ok" } },
  live: { target: "default", subject: { repo: "smithers-canary/smithers" } },
  steps: [
    {
      caption: "Read the source",
      go: "/smithers-canary/smithers/blob/main/src/runtime.ts",
      expect: [...mondayClaim, { see: { role: "region", name: "src/runtime.ts" } }, {
        see: { role: "link", name: "Blame" }
      }]
    },
    {
      caption: "Find the agent-authored line",
      go: "/smithers-canary/smithers/blame/main/src/runtime.ts",
      expect: [...mondayClaim, { see: { role: "row", name: "Agent" } }, {
        see: { role: "link", href: "/smithers-canary/smithers/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
      }]
    },
    {
      caption: "Open its commit",
      click: { role: "link", href: "/smithers-canary/smithers/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      expect: [...mondayClaim, { see: { role: "region", name: "Commit" } }, {
        see: { role: "link", href: "/smithers-canary/smithers/runs/spec-agent-run" }
      }]
    },
    {
      caption: "Open the run that wrote it",
      click: { role: "link", href: "/smithers-canary/smithers/runs/spec-agent-run" },
      expect: [...mondayClaim, { see: { role: "region", name: "Stages" } }, {
        see: { role: "link", href: "/smithers-canary/smithers/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
      }]
    }
  ]
})
