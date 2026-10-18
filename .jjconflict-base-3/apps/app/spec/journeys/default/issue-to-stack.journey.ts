import { journey } from "../../journey"
import { mondayClaim } from "../../mondayClaim"
export default journey({
  id: "default/issue-to-stack",
  site: "default",
  lifecycle: "evergreen",
  spec: "PM D5; repo-ui-spec views 7, 8",
  world: { base: "default", variant: { as: "member", data: "full", net: "ok" } },
  live: { skip: "Member actions are mock-only; live is always signed out" },
  steps: [
    {
      caption: "Open the issue",
      go: "/smithers-canary/smithers/issues/4267",
      expect: [...mondayClaim, { see: { role: "button", name: "Make TODO" } }]
    },
    {
      caption: "Make a TODO",
      click: { role: "button", name: "Make TODO" },
      expect: [...mondayClaim, { see: { role: "link", href: "/smithers-canary/smithers/stack" } }]
    },
    {
      caption: "Find the issue on the Stack",
      go: "/smithers-canary/smithers/stack",
      expect: [...mondayClaim, { see: { role: "link", href: "/smithers-canary/smithers/issues/4267" } }]
    },
    {
      caption: "The TODO issue shortcut lists it",
      go: "/smithers-canary/smithers/issues?q=is:todo",
      expect: [...mondayClaim, { see: { role: "link", href: "/smithers-canary/smithers/issues/4267" } }]
    }
  ]
})
