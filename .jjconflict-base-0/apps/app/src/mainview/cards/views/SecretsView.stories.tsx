import { fixtures } from "@smthrs/rpc/fixtures/Secrets"
import { SecretsView } from "./SecretsView"
import type { ViewStory } from "./stories"

/*
 * #4056: the view draws no title of its own — the card frame draws
 * "Secrets · owner/repository" — so no story expects that word in its text.
 * The section's accessible name is asserted in Views.test.tsx instead.
 */

export const stories: ViewStory[] = Object.entries(fixtures).map(([name, fixture]) => ({
  name, expect: [...fixture.expect],
  actions: [...fixture.model.secrets.flatMap(secret => secret.actions), ...fixture.actions],
  render: (callbacks, removed) => {
    let skip = removed !== undefined
    const keep = () => { if (skip) { skip = false; return false }; return true }
    return <SecretsView {...fixture} model={{ ...fixture.model, secrets: fixture.model.secrets.map(secret => ({ ...secret, actions: secret.actions.filter(keep) })) }} actions={fixture.actions.filter(keep)} onView={callbacks.onView} onAction={(tag, args) => callbacks.onAction(tag, args && "value" in args ? { ...args, value: "[redacted]" } : args)} />
  },
}))

// Optional Hosts and unavailable form actions are distinct from the populated examples.
stories.push({
  name: "no_hosts_field", expect: ["Add"],
  render: callbacks => <SecretsView {...fixtures.empty} actions={fixtures.empty.actions.map(action => ({ ...action, input: action.input?.filter(field => field.name !== "hosts") }))} onView={callbacks.onView} onAction={(tag, args) => callbacks.onAction(tag, args && "value" in args ? { ...args, value: "[redacted]" } : args)} />
}, {
  name: "disabled_form", expect: ["Change pending"],
  render: callbacks => <SecretsView {...fixtures.empty} actions={fixtures.empty.actions.map(action => ({ ...action, disabled: { reason: "Change pending" } }))} {...callbacks} />
}, {
  name: "hostile", expect: ['<img src=x onerror="alert(1)">', "main only"],
  render: callbacks => <SecretsView {...fixtures.empty} model={{ secrets: [{ name: '<img src=x onerror="alert(1)">', scope: "main_only", hosts: ["<script>evil</script>"], actions: [] }] }} actions={[]} {...callbacks} />
})
