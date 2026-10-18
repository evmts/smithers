import { journey } from "../../journey"
import { mondayClaim } from "../../mondayClaim"
export const modelCases = ["no", "yes"].map((hosted) =>
  journey({
    id: `default/settings-models-${hosted}`,
    site: "default",
    lifecycle: "evergreen",
    spec: "PM D6; repo-ui-spec view 13; hosted vs install",
    world: { base: "default", variant: { as: "member", hosted } },
    live: { skip: "Member model connections are mock-only" },
    steps: [{
      caption: `Settings → Models; hosted can land: ${hosted}`,
      go: "/smithers-canary/smithers/settings",
      expect: [...mondayClaim, { see: { role: "link", name: "Models" } }]
    }, {
      caption: `Models: ${hosted}`,
      click: { role: "link", name: "Models" },
      expect: [
        ...mondayClaim,
        ...(hosted === "no" ?
          [
            { see: { role: "status" }, text: { pattern: "install|hosted" } },
            { see: { role: "button", name: "Connect Claude" }, count: 0 },
            { see: { role: "button", name: "Connect Codex" }, count: 0 }
          ] :
          [{ see: { role: "button", name: "Connect Claude" } }, { see: { role: "button", name: "Connect Codex" } }])
      ]
    }]
  })
)
export default modelCases
