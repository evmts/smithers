import { useState } from "react"
import { MOCK_NOW, settings } from "../../fixtures"
import { Empty } from "../../frame"
import { Box, RelTime, Row, StateIcon, toast } from "../../ui"
import { Field, FormCard, SettingsHeading, Toggle, useSettingsCommands } from "./shared"

type Webhook = {
  url: string
  events: string[]
  lastDelivery?: { date: string; status: number }
}

export const WebhooksEmpty = () => <Empty title="No webhooks." />

export const WebhooksReady = ({ empty = false }: { empty?: boolean }) => {
  const [hooks, setHooks] = useState<Webhook[]>(empty ? [] : settings.webhooks)
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState("")
  const [events, setEvents] = useState<string[]>(["run.completed"])
  const options = [...new Set([
    "run.completed", "run.failed", "pull.opened", "issue.opened",
    ...settings.webhooks.flatMap(hook => hook.events)
  ])]
  const redeliver = (url: string) => {
    if (!hooks.some(hook => hook.url === url)) throw new Error("Webhook not found.")
    setHooks(current => current.map(hook => hook.url === url
      ? { ...hook, lastDelivery: { date: MOCK_NOW, status: 204 } } : hook))
    toast("Webhook delivered. HTTP 204.")
  }
  useSettingsCommands({
    "webhook.create": {
      purpose: "Add a webhook",
      fields: [{ name: "url", label: "Payload URL", type: "url", required: false }],
      confirm: false,
      run: (values, context) => {
        setUrl(values.url ?? "")
        setAdding(true)
        context.closeAsk()
      }
    },
    "webhook.event": {
      purpose: "Toggle webhook event",
      fields: [{ name: "event", label: "Event", options }],
      confirm: false,
      run: ({ event }, context) => {
        setAdding(true)
        setEvents(current => current.includes(event)
          ? current.filter(item => item !== event) : [...current, event])
        context.closeAsk()
      }
    },
    "webhook.redeliver": {
      purpose: "Redeliver a webhook",
      fields: [{ name: "url", label: "Payload URL", type: "url" }],
      confirm: false,
      run: ({ url }) => redeliver(url)
    }
  })
  return (
    <>
      <SettingsHeading title="Webhooks">
        {!adding && (
          <button
            className="repo-ui-btn repo-ui-btn-primary"
            title="/webhook.create"
            onClick={() => setAdding(true)}
          >
            Add webhook
          </button>
        )}
      </SettingsHeading>
      {adding && (
        <FormCard
          title="Add webhook"
          command={`/webhook.create ${url}`}
          submit="Add webhook"
          disabled={events.length === 0}
          onCancel={() => setAdding(false)}
          onSubmit={event => {
            event.preventDefault()
            if (hooks.some(hook => hook.url === url.trim())) {
              const input = event.currentTarget.querySelector<HTMLInputElement>('input[type="url"]')
              input?.setCustomValidity("A webhook with this URL already exists.")
              input?.reportValidity()
              return
            }
            setHooks(current => [...current, { url: url.trim(), events: [...events] }])
            setUrl("")
            setEvents(["run.completed"])
            setAdding(false)
            toast("Webhook added.")
          }}
        >
          <Field label="Payload URL">
            <input
              autoFocus
              className="repo-ui-input"
              type="url"
              value={url}
              placeholder="https://hooks.example.test/events"
              onChange={event => {
                setUrl(event.target.value)
                event.target.setCustomValidity(hooks.some(hook => hook.url === event.target.value.trim())
                  ? "A webhook with this URL already exists." : "")
              }}
              pattern="https://.*"
              required
            />
          </Field>
          <fieldset className="repo-settings-fieldset">
            <legend>Events</legend>
            {options.map(name => (
              <Toggle
                key={name}
                label={name}
                checked={events.includes(name)}
                command={`/webhook.event ${name}`}
                onChange={enabled => setEvents(current => enabled
                  ? [...current, name] : current.filter(event => event !== name))}
              />
            ))}
          </fieldset>
        </FormCard>
      )}
      <Box>
        {hooks.length === 0 ? <WebhooksEmpty /> : hooks.map(hook => (
          <Row className="repo-settings-row" key={hook.url}>
            <div className="repo-settings-grow">
              <strong className="repo-settings-mono">{hook.url}</strong>
              <p className="repo-settings-muted">{hook.events.join(", ")}</p>
              {hook.lastDelivery ? (
                <div className="repo-settings-delivery">
                  <StateIcon state={hook.lastDelivery.status < 300 ? "success" : "failure"} />
                  <span>HTTP {hook.lastDelivery.status}</span>
                  <RelTime date={hook.lastDelivery.date} />
                </div>
              ) : <p className="repo-settings-muted">No deliveries.</p>}
            </div>
            <button
              className="repo-ui-btn"
              title={`/webhook.redeliver ${hook.url}`}
              onClick={() => redeliver(hook.url)}
            >
              Redeliver
            </button>
          </Row>
        ))}
      </Box>
    </>
  )
}
