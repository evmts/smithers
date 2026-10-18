import type { Route, Screen } from "../../../core/router"
import { SettingsPage } from "./Settings"
import { sections } from "./shared"

const member = "as=in&role=member&host=install&landing=open&model=connected&hosted=up&net=ok&data=full"
const screen = (id: string, path: string, query: string, label: string): Screen => ({
  id: `settings-${id}`,
  route: `smithers.sh/maya/tinyhttp/settings${path ? `/${path}` : ""}?${query}`,
  label,
  site: "default"
})
const withFlag = (key: string, value: string) => {
  const query = new URLSearchParams(member)
  query.set(key, value)
  return query.toString()
}

export const routes: Route[] = [
  {
    pattern: "smithers.sh/:owner/:repo/settings/:section",
    name: "Repository settings · section",
    render: context => <SettingsPage context={context} />,
    screens: [
      ...sections.map(([path, label]) => screen(`${path}-member`, path, member, `Settings · ${label}`)),
      ...sections.map(([path, label]) => ({
        ...screen(`${path}-loading`, path, withFlag("net", "slow"), `${label} · loading`),
        wait: 100
      })),
      ...sections.map(([path, label]) => screen(`${path}-error`, path, withFlag("net", "error"), `${label} · error`)),
      ...sections.map(([path]) => (
        screen(`${path}-empty`, path, withFlag("data", "empty"), `${path} · empty`)
      )),
      screen("models-connect-codex", "models", `${member}&connect=codex`, "Models · connect Codex"),
      screen("models-connected-both", "models", `${member}&connected=codex`, "Models · both connected"),
      screen("models-held", "models", withFlag("host", "hosted").replace("landing=open", "landing=install"), "Models · hosted connections held"),
      screen("sandboxes-hosted-paused", "sandboxes", withFlag("host", "hosted").replace("hosted=up", "hosted=paused"), "Sandboxes · hosted paused"),
      screen("members-empty-invites", "members", `${member}&invites=empty`, "Members · no pending invites")
    ]
  },
  {
    pattern: "smithers.sh/:owner/:repo/settings",
    name: "Repository settings",
    render: context => <SettingsPage context={context} />,
    screens: [
      screen("general-default", "", member, "Settings · General by default"),
      screen("reader-denied", "", withFlag("role", "reader"), "Settings · members only"),
      screen("signed-out", "", withFlag("as", "out"), "Settings · sign in"),
      { ...screen("loading", "", withFlag("net", "slow"), "Settings · loading"), wait: 100 },
      screen("error", "", withFlag("net", "error"), "Settings · read failed")
    ]
  }
]
