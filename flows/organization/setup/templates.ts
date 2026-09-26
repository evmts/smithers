/** Files `init` writes beside an organization: the environment template and the one Slack app's manifest. */
import * as Providers from "../../../packages/smithers/src/Providers.ts"

/** The key variable each native provider route reads first (`NativeEquipment`). */
const nativeKeys: Readonly<Record<string, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY"
}

/** The environment variable that credentials a seat, or `undefined` for a seat no route serves. */
export const seatVariable = (seat: string): string | undefined => {
  const expanded = Providers.expandSeat(seat)
  const separator = expanded.indexOf(":")
  // A bare model id is on the Anthropic route, as the native resolver reads it.
  const provider = separator < 0 ? "anthropic" : expanded.slice(0, separator)
  if (Object.hasOwn(Providers.compatible, provider)) return Providers.compatible[provider]!.variables[0]
  return Object.hasOwn(nativeKeys, provider) ? nativeKeys[provider] : undefined
}

/** Every seat an organization page names that runs a model: its seats and a judge other than `none`. */
export const modelSeats = (organization: { readonly seats: Readonly<Record<string, string>>; readonly judge: string }) =>
  [...new Set([...Object.values(organization.seats), ...(organization.judge === "none" ? [] : [organization.judge])])]

/** Slack bot scopes the one app asks for, matching the integrations Slack guide. */
export const slackBotScopes = [
  "app_mentions:read",
  "channels:history",
  "chat:write",
  "chat:write.customize",
  "im:history",
  "im:read",
  "im:write",
  "users:read"
] as const

/** Slack bot events the app subscribes to. */
export const slackBotEvents = ["app_mention", "message.im"] as const

/** Slack's app-manifest YAML for one Socket Mode app with the App Home messages tab open. */
export const slackManifest = (name: string): string => {
  if (!/^[\w .-]{1,35}$/.test(name)) throw new Error("The Slack app name must be 1-35 letters, digits, spaces, dots or dashes")
  return [
    "display_information:",
    `  name: ${name}`,
    "features:",
    "  app_home:",
    "    home_tab_enabled: false",
    "    messages_tab_enabled: true",
    "    messages_tab_read_only_enabled: false",
    "  bot_user:",
    `    display_name: ${name}`,
    "    always_online: true",
    "oauth_config:",
    "  scopes:",
    "    bot:",
    ...slackBotScopes.map((scope) => `      - ${scope}`),
    "settings:",
    "  event_subscriptions:",
    "    bot_events:",
    ...slackBotEvents.map((event) => `      - ${event}`),
    "  interactivity:",
    "    is_enabled: true",
    "  org_deploy_enabled: false",
    "  socket_mode_enabled: true",
    "  token_rotation_enabled: false",
    ""
  ].join("\n")
}

/** What `.env.example` is filled from. */
export interface EnvironmentInput {
  readonly root: string
  readonly stateDir: string
  readonly seats: ReadonlyArray<string>
  readonly maxConcurrentVMs: number
}

/** The environment template: names only, every secret left empty. */
export const environmentExample = (input: EnvironmentInput): string => {
  const variables = [...new Set(input.seats.map(seatVariable).filter((name) => name !== undefined))]
  return [
    `# Model seats: ${input.seats.join(", ")}`,
    ...variables.map((name) => `${name}=`),
    "",
    "# Slack: one app from slack-app-manifest.yaml",
    "SMITHERS_SLACK_BOT_TOKEN=",
    "SMITHERS_SLACK_APP_TOKEN=",
    "SMITHERS_SLACK_TEAM_IDS=",
    "SMITHERS_SLACK_USER_IDS=",
    "# SMITHERS_SLACK_CHANNEL_IDS=",
    "",
    "# Host",
    `SMITHERS_ORG_ROOT=${input.root}`,
    "SMITHERS_ORG_REPOS=",
    `SMITHERS_ORG_STATE_DIR=${input.stateDir}`,
    `# SMITHERS_ORG_MAX_CONCURRENT_VMS=${input.maxConcurrentVMs}`,
    ""
  ].join("\n")
}
