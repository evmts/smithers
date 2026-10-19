import { useId, useRef, useState } from "react"
import { useMock } from "../../../core/mock"
import { settings } from "../../fixtures"
import { Empty } from "../../frame"
import { Box, Row } from "../../ui"
import { Field, Save, SettingsHeading, useDraft, useSettingsCommands } from "./shared"

const ListEditor = ({ label, items, placeholder, command, onChange, hostname = false }: {
  label: string
  items: string[]
  placeholder: string
  command: string
  onChange: (items: string[]) => void
  hostname?: boolean
}) => {
  const [next, setNext] = useState("")
  const field = useRef<HTMLInputElement>(null)
  const id = useId()
  const invalidReason = (value: string) => !value ? "Enter a value." : items.includes(value) ? "Already added."
    : hostname && !/^[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(value) ? "Enter a host without a scheme or path." : ""
  const add = () => {
    const value = next.trim()
    const invalid = invalidReason(value)
    field.current?.setCustomValidity(invalid)
    if (invalid) {
      field.current?.reportValidity()
      return
    }
    onChange([...items, value])
    setNext("")
  }
  useSettingsCommands({
    [`${command}.add`]: {
      purpose: `Add ${hostname ? "allowed host" : "sandbox service"}`,
      fields: [{ name: "value", label: hostname ? "Host" : "Service image", placeholder }],
      confirm: false,
      run: ({ value }) => {
        const invalid = invalidReason(value.trim())
        if (invalid) throw new Error(invalid)
        onChange([...items, value.trim()])
        setNext("")
      }
    },
    [`${command}.remove`]: {
      purpose: `Remove ${hostname ? "allowed host" : "sandbox service"}`,
      fields: [{ name: "value", label: hostname ? "Host" : "Service image" }],
      confirm: false,
      run: ({ value }) => {
        if (!items.includes(value)) throw new Error("This item is not in the list.")
        onChange(items.filter(item => item !== value))
      }
    }
  })
  return (
    <div className="repo-settings-list-editor">
      <label htmlFor={id}>{label}</label>
      <Box>
        {items.length ? items.map(item => (
          <Row key={item} className="repo-settings-row">
            <code className="repo-settings-grow">{item}</code>
            <button
              type="button"
              className="repo-ui-btn repo-ui-btn-quiet"
              title={`/${command}.remove ${item}`}
              aria-label={`Remove ${item}`}
              onClick={() => onChange(items.filter(value => value !== item))}
            >
              Remove
            </button>
          </Row>
        )) : <Empty title={hostname ? "No allowed hosts." : "No services."} />}
      </Box>
      <div className="repo-settings-add-row">
        <input
          ref={field}
          id={id}
          className="repo-ui-input repo-settings-mono"
          value={next}
          placeholder={placeholder}
          autoComplete="off"
          onChange={event => {
            event.target.setCustomValidity("")
            setNext(event.target.value)
          }}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault()
              add()
            }
          }}
        />
        <button type="button" className="repo-ui-btn" title={`/${command}.add`} onClick={add}>
          Add
        </button>
      </div>
    </div>
  )
}

export const SandboxesPaused = () => (
  <div className="repo-settings-banner" role="status">
    Hosted sandboxes are paused while hosted machines recover. New sandboxes cannot start.
  </div>
)

export const SandboxesReady = ({ empty = false }: { empty?: boolean }) => {
  const { flags } = useMock()
  const draft = useDraft({
    ...settings.sandboxes,
    allow: empty ? [] : [...settings.sandboxes.allow],
    services: empty ? [] : [...settings.sandboxes.services]
  })
  const update = <K extends keyof typeof draft.value,>(key: K, value: typeof draft.value[K]) => {
    draft.setValue(current => ({ ...current, [key]: value }))
  }
  useSettingsCommands({
    "sandbox.egress": {
      purpose: "Set sandbox network egress",
      fields: [{ name: "mode", label: "Egress mode", options: ["none", "allowlist", "open"] }],
      confirm: false,
      run: ({ mode }) => update("egress", mode as "none" | "allowlist" | "open")
    }
  })
  return (
    <>
      <SettingsHeading title="Sandboxes">
        <Save form="repo-settings-sandboxes" dirty={draft.dirty} section="sandboxes" />
      </SettingsHeading>
      {flags.host === "hosted" && flags.hosted === "paused" && <SandboxesPaused />}
      <form
        id="repo-settings-sandboxes"
        className="repo-settings-form"
        onSubmit={event => {
          event.preventDefault()
          draft.save()
        }}
      >
        <fieldset className="repo-settings-fieldset">
          <legend>Network egress</legend>
          {([
            ["none", "None", "Block outbound connections."],
            ["allowlist", "Allowlist", "Allow only the hosts below."],
            ["open", "Open", "Allow all outbound connections."]
          ] as const).map(([mode, label, detail]) => (
            <label key={mode} className="repo-settings-radio">
              <input
                type="radio"
                name="egress"
                value={mode}
                checked={draft.value.egress === mode}
                title={`/sandbox.egress ${mode}`}
                onChange={() => update("egress", mode)}
              />
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
            </label>
          ))}
        </fieldset>
        {draft.value.egress === "allowlist" && (
          <ListEditor
            label="Allowed hosts"
            items={draft.value.allow}
            placeholder="registry.npmjs.org"
            command="sandbox.host"
            onChange={value => update("allow", value)}
            hostname
          />
        )}
        <ListEditor
          label="Services"
          items={draft.value.services}
          placeholder="postgres:16"
          command="sandbox.service"
          onChange={value => update("services", value)}
        />
        <div className="repo-settings-columns">
          <Field label="Max running sandboxes">
            <input
              className="repo-ui-input"
              type="number"
              min={1}
              max={100}
              step={1}
              value={draft.value.maxRunning}
              onChange={event => update("maxRunning", Number(event.target.value))}
              required
            />
          </Field>
          <Field label="Idle suspend (minutes)">
            <input
              className="repo-ui-input"
              type="number"
              min={1}
              max={1440}
              step={1}
              value={draft.value.idleSuspendMinutes}
              onChange={event => update("idleSuspendMinutes", Number(event.target.value))}
              required
            />
          </Field>
        </div>
      </form>
    </>
  )
}
