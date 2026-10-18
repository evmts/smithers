import { useState } from "react"
import { Link } from "../../../core/router"
import { MOCK_NOW, settings, to } from "../../fixtures"
import type { Settings } from "../../fixtures/types"
import { Empty } from "../../frame"
import { Box, RelTime, Row, toast } from "../../ui"
import { ConfirmCard, Field, FormCard, SettingsHeading, useSettingsCommands } from "./shared"

type Secret = Settings["secrets"][number]

export const SecretsEmpty = () => <Empty title="No secrets." />

export const SecretsReady = ({ empty = false }: { empty?: boolean }) => {
  const [secrets, setSecrets] = useState<Secret[]>(empty ? [] : settings.secrets)
  const [editing, setEditing] = useState<Secret | "new" | null>(null)
  const [removing, setRemoving] = useState<Secret | null>(null)
  const [name, setName] = useState("")
  useSettingsCommands({
    "secret.new": {
      purpose: "Add a repository secret",
      fields: [{ name: "name", label: "Secret name", required: false }],
      confirm: false,
      run: (values, context) => {
        setName(values.name ?? "")
        setEditing("new")
        context.closeAsk()
      }
    },
    "secret.update": {
      purpose: "Update a repository secret",
      fields: [{ name: "name", label: "Secret name" }],
      confirm: false,
      run: ({ name }, context) => {
        const secret = secrets.find(item => item.name === name)
        if (!secret) throw new Error("Secret not found.")
        setName(secret.name)
        setEditing(secret)
        context.closeAsk()
      }
    },
    "secret.remove": {
      purpose: "Remove a repository secret",
      fields: [{ name: "name", label: "Secret name" }],
      confirm: false,
      run: ({ name }, context) => {
        const secret = secrets.find(item => item.name === name)
        if (!secret) throw new Error("Secret not found.")
        setRemoving(secret)
        context.closeAsk()
      }
    }
  })
  return (
    <>
      <SettingsHeading title="Secrets">
        {!editing && (
          <button
            className="repo-ui-btn repo-ui-btn-primary"
            title="/secret.new"
            onClick={() => {
              setName("")
              setEditing("new")
            }}
          >
            New secret
          </button>
        )}
      </SettingsHeading>
      {editing && (
        <FormCard
          key={editing === "new" ? "new" : editing.name}
          title={editing === "new" ? "New secret" : `Update ${editing.name}`}
          command={editing === "new" ? `/secret.new ${name}` : `/secret.update ${editing.name}`}
          onCancel={() => {
            setName("")
            setEditing(null)
          }}
          onSubmit={event => {
            event.preventDefault()
            const form = event.currentTarget
            if (editing === "new" && secrets.some(secret => secret.name === name.trim())) {
              const input = form.querySelector<HTMLInputElement>('input:not([type="password"])')
              input?.setCustomValidity("A secret with this name already exists. Use Update.")
              input?.reportValidity()
              return
            }
            const field = form.elements.namedItem("value") as HTMLInputElement
            if (!field.value.trim()) {
              field.setCustomValidity("Enter a secret value.")
              field.reportValidity()
              return
            }
            // Retain metadata only. Secret values never enter state, storage, notices or fixture data.
            field.value = ""
            if (editing === "new") {
              setSecrets(current => [...current, { name: name.trim(), updated: MOCK_NOW, usedBy: [] }])
            } else {
              setSecrets(current => current.map(secret => secret.name === editing.name
                ? { ...secret, updated: MOCK_NOW } : secret))
            }
            toast(editing === "new" ? "Secret added." : "Secret updated.")
            setEditing(null)
            setName("")
          }}
        >
          <Field label="Name">
            <input
              autoFocus={editing === "new"}
              className="repo-ui-input repo-settings-mono"
              value={name}
              readOnly={editing !== "new"}
              onChange={event => {
                setName(event.target.value)
                event.target.setCustomValidity(secrets.some(secret => secret.name === event.target.value)
                  ? "A secret with this name already exists. Use Update." : "")
              }}
              pattern="[A-Z_][A-Z0-9_]*"
              placeholder="RELEASE_TOKEN"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </Field>
          <Field label={editing === "new" ? "Value" : "New value"} hint="The value is never shown after saving.">
            <input
              autoFocus={editing !== "new"}
              name="value"
              type="password"
              className="repo-ui-input repo-settings-mono"
              autoComplete="new-password"
              onChange={event => event.target.setCustomValidity("")}
              required
            />
          </Field>
        </FormCard>
      )}
      <Box>
        {secrets.length === 0 ? <SecretsEmpty /> : secrets.map(secret => (
          <Row className="repo-settings-row" key={secret.name}>
            <div className="repo-settings-grow">
              <strong className="repo-settings-mono">{secret.name}</strong>
              <p className="repo-settings-muted">Updated <RelTime date={secret.updated} /></p>
              <div className="repo-settings-flow-links">
                <span className="repo-settings-muted">Used by</span>
                {secret.usedBy.length ? secret.usedBy.map(flow => (
                  <Link key={flow} to={to(`flows/${flow}`)}>{flow}</Link>
                )) : <span className="repo-settings-muted">No flows</span>}
              </div>
            </div>
            <div className="repo-ui-actions">
              <button
                className="repo-ui-btn"
                title={`/secret.update ${secret.name}`}
                onClick={() => {
                  setName(secret.name)
                  setEditing(secret)
                }}
              >
                Update
              </button>
              <button
                className="repo-ui-btn repo-ui-btn-quiet repo-settings-danger-button"
                title={`/secret.remove ${secret.name}`}
                onClick={() => setRemoving(secret)}
              >
                Remove
              </button>
            </div>
          </Row>
        ))}
      </Box>
      {removing && (
        <ConfirmCard
          title={`Remove ${removing.name}?`}
          detail="Flows using this secret will no longer receive it."
          command={`/secret.remove ${removing.name}`}
          label="Remove secret"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            setSecrets(current => current.filter(secret => secret.name !== removing.name))
            setRemoving(null)
            toast("Secret removed.")
          }}
        />
      )}
    </>
  )
}
