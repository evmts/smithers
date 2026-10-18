import { useEffect, useId, useRef, useState, type FormEventHandler, type ReactNode } from "react"
import { registerSlash, type SlashCommand } from "../../frame"
import { repo } from "../../fixtures"
import { Box, toast } from "../../ui"

export const sections = [
  ["general", "General"],
  ["members", "Members"],
  ["models", "Models"],
  ["secrets", "Secrets"],
  ["environments", "Environments"],
  ["sandboxes", "Sandboxes"],
  ["triggers", "Triggers"],
  ["webhooks", "Webhooks"],
  ["sync", "GitHub sync"],
  ["reporting", "Reporting"]
] as const

export type Section = typeof sections[number][0]

export const useDraft = <T,>(initial: T) => {
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(() => JSON.stringify(initial))
  const dirty = JSON.stringify(value) !== saved
  const save = () => {
    setSaved(JSON.stringify(value))
    toast("Settings saved.")
  }
  return { value, setValue, dirty, save }
}

export const SettingsHeading = ({ title, children }: { title: string; children?: ReactNode }) => (
  <header className="repo-settings-heading">
    <h1>{title}</h1>
    {children}
  </header>
)

/** Keep handlers fresh without unregistering commands every time a field changes. */
export const useSettingsCommands = (commands: Record<string, SlashCommand>) => {
  const handlers = useRef(commands)
  handlers.current = commands
  const names = Object.keys(commands).sort().join("|")
  useEffect(() => {
    const cleanup = names.split("|").filter(Boolean).map(name => registerSlash(name, {
      ...handlers.current[name],
      run: (values, context) => handlers.current[name].run(values, context)
    }))
    return () => cleanup.forEach(dispose => dispose())
  }, [names])
}

export const Save = ({ form, dirty, section }: { form: string; dirty: boolean; section: string }) => {
  useSettingsCommands({
    "settings.save": {
      purpose: "Save settings",
      fields: [{ name: "section", label: "Section", required: false }],
      confirm: false,
      run: (values, context) => {
        if (values.section && values.section !== section) throw new Error(`Open ${values.section} settings first.`)
        if (!dirty) {
          toast("No unsaved changes.")
          return
        }
        context.closeAsk()
        document.getElementById(form)?.scrollIntoView({ block: "nearest" })
        const element = document.getElementById(form) as HTMLFormElement | null
        element?.requestSubmit()
      }
    }
  })
  return (
    <button
      type="submit"
      form={form}
      className="repo-ui-btn repo-ui-btn-primary"
      title={`/settings.save ${section}`}
      disabled={!dirty}
    >
      Save
    </button>
  )
}

export const Field = ({ label, hint, children }: {
  label: string
  hint?: string
  children: ReactNode
}) => (
  <label className="repo-settings-field">
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>
)

export const FormCard = ({ title, command, submit = "Save", onSubmit, onCancel, children, disabled = false }: {
  title: string
  command: string
  submit?: string
  onSubmit: FormEventHandler<HTMLFormElement>
  onCancel: () => void
  children: ReactNode
  disabled?: boolean
}) => {
  const id = useId()
  useSettingsCommands({
    cancel: { fields: [], confirm: false, run: onCancel }
  })
  return (
    <Box className="repo-settings-form-card">
      <form onSubmit={onSubmit} aria-labelledby={id}>
        <h2 id={id}>{title}</h2>
        {children}
        <div className="repo-ui-actions">
          <button className="repo-ui-btn repo-ui-btn-primary" title={command.replace(/^(\/[\w.-]+)/, "$1.save")} disabled={disabled}>
            {submit}
          </button>
          <button type="button" className="repo-ui-btn repo-ui-btn-quiet" title="/cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Box>
  )
}

export const ConfirmCard = ({ title, detail, command, label = "Confirm", typeName = false, onConfirm, onCancel }: {
  title: string
  detail: ReactNode
  command: string
  label?: string
  typeName?: boolean
  onConfirm: () => void
  onCancel: () => void
}) => {
  const [name, setName] = useState("")
  const id = useId()
  useSettingsCommands({
    cancel: { fields: [], confirm: false, run: onCancel }
  })
  return (
    <Box className="repo-settings-confirm">
      <form
        role="dialog"
        aria-labelledby={id}
        onSubmit={event => {
          event.preventDefault()
          if (!typeName || name === repo.name) onConfirm()
        }}
        onKeyDown={event => {
          if (event.key === "Escape") onCancel()
        }}
      >
        <h2 id={id}>{title}</h2>
        <p>{detail}</p>
        {typeName && (
          <Field label={`Type ${repo.name} to confirm`}>
            <input
              autoFocus
              className="repo-ui-input"
              value={name}
              onChange={event => setName(event.target.value)}
              autoComplete="off"
              required
            />
          </Field>
        )}
        <div className="repo-ui-actions">
          <button
            autoFocus={!typeName}
            className="repo-ui-btn repo-settings-danger-button"
            title={command.replace(/^(\/[\w.-]+)/, "$1.confirm")}
            disabled={typeName && name !== repo.name}
          >
            {label}
          </button>
          <button type="button" className="repo-ui-btn repo-ui-btn-quiet" title="/cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Box>
  )
}

export const Toggle = ({ label, checked, onChange, command }: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  command: string
}) => (
  <label className="repo-settings-toggle">
    <input
      type="checkbox"
      checked={checked}
      onChange={event => onChange(event.target.checked)}
      title={command}
    />
    <span>{label}</span>
  </label>
)
