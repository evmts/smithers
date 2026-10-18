import { journey } from "../../journey"
import { mondayClaim } from "../../mondayClaim"
export default journey({
  id: "default/waiting-on-you",
  site: "default",
  lifecycle: "evergreen",
  spec: "PM D4; repo-ui-spec view 9; principle 4",
  world: { base: "default", variant: { as: "member", data: "full", net: "ok" } },
  live: { skip: "Member actions are mock-only; live is always signed out" },
  steps: [
    {
      caption: "Open runs",
      go: "/smithers-canary/smithers/runs",
      expect: [...mondayClaim, { see: { role: "link", name: "Waiting on you" } }]
    },
    {
      caption: "Filter waiting runs; the waiting run leads",
      click: { role: "link", name: "Waiting on you" },
      expect: [...mondayClaim, {
        see: { role: "listitem", nth: 0, within: { role: "list", name: "Runs" } },
        text: "spec-waiting-run"
      }, { see: { role: "button", name: "Answer" } }]
    },
    {
      caption: "Answer the approval",
      click: { role: "button", name: "Answer" },
      expect: [...mondayClaim, { see: { role: "status" }, text: "Running" }]
    },
    {
      caption: "The same act has a slash form",
      say: "/approvals",
      expect: [...mondayClaim, { see: { role: "form", name: "Approval" } }]
    },
    {
      caption: "The same act is available to the agent",
      say: "Show the approval waiting for my answer",
      expect: [...mondayClaim, { see: { role: "region", name: "Approval" } }]
    }
  ]
})
