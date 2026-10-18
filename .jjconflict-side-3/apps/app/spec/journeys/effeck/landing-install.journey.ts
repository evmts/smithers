import { mondayClaim } from "../../mondayClaim"
import { journey } from "../../journey"
export default journey({
  id: "effeck/landing-install", site: "effeck", spec: "PM L2; effeck/app-spec Monday launch; pm-walk E9-E12",
  world: { base: "effeck", variant: { as: "out", converter: "off" } }, live: { target: "effeck" },
  steps: [1280, 390].map(width => ({ viewport: { width, height: width === 390 ? 844 : 800 }, caption: "Install Effeck", spec: "E9 E10 E11 E12", go: "/", expect: [...mondayClaim,
    { text: "Example", source: "html" }, { see: { role: "code", within: { role: "region", name: "Example" } }, count: 2 }, { text: "Both compile.", source: "html" }, { text: "npm create effeck@latest my-app" },
    { see: { role: "button", name: "Copy" } }, { url: { startsWith: "" }, on: { role: "link", name: "Docs" }, status: 200 },
    { url: "https://smithers.sh/effeck/effeck", on: { role: "link", name: "Source on Smithers" }, status: 200 },
    { absent: "Powered by Smithers" }, { absent: "bun create effeck" }, { see: { role: "button", name: "Convert" }, count: 0 },
    { see: { role: "textbox", editable: true }, count: 0 }
  ] }))
})
