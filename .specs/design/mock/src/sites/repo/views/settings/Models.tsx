import { useState } from "react"
import { useMock } from "../../../core/mock"
import { Link } from "../../../core/router"
import { agents, fmtDate, MOCK_NOW, repo, settings, to } from "../../fixtures"
import type { Settings } from "../../fixtures/types"
import { Box, CopyButton, StateIcon, toast } from "../../ui"
import { ConfirmCard, Field, FormCard, SettingsHeading, useSettingsCommands } from "./shared"

type Provider = "claude" | "codex"
type Connection = Settings["models"][number]
const providerName = (provider: Provider) => provider === "claude" ? "Claude" : "Codex"

const ModelUsage = ({ provider }: { provider: Provider }) => {
  const using = agents.filter(agent => agent.connection === provider)
  const flowNames = [...new Set(using.flatMap(agent => agent.flows))]
  return (
    <div className="repo-settings-model-usage">
      <div>
        <span className="repo-settings-muted">Agents</span>
        {using.length ? using.map(agent => (
          <Link key={agent.id} to={to("agents")}>{agent.name}</Link>
        )) : <span className="repo-settings-muted">None</span>}
      </div>
      <div>
        <span className="repo-settings-muted">Flows</span>
        {flowNames.length ? flowNames.map(name => (
          <Link key={name} to={to(`flows/${name}`)}>{name}</Link>
        )) : <span className="repo-settings-muted">None</span>}
      </div>
    </div>
  )
}

export const ModelsHeld = () => (
  <div className="repo-settings-banner" role="status">
    On smithers.sh, model connections arrive with hosted runs. Locally, <code>smthrs</code> uses
    your Claude Code or Codex login.
    <div><Link className="repo-ui-btn repo-ui-btn-primary" to="smithers.sh/docs/installation">Open install instructions</Link></div>
  </div>
)

const ConnectModel = ({ provider, onCancel, onConnect }: {
  provider: Provider
  onCancel: () => void
  onConnect: () => void
}) => {
  const [method, setMethod] = useState<"local" | "device">("local")
  const [code, setCode] = useState("")
  const [finished, setFinished] = useState(false)
  const name = providerName(provider)
  const command = provider === "codex" ? "codex login" : "claude auth login"
  return (
    <FormCard
      title={`Connect ${name}`}
      command={`/model.connect ${provider}`}
      submit={`Connect ${name}`}
      disabled={method === "local" ? !finished : !code.trim()}
      onCancel={onCancel}
      onSubmit={event => {
        event.preventDefault()
        setCode("")
        onConnect()
      }}
    >
      <fieldset className="repo-settings-fieldset repo-settings-inline-options">
        <legend>Sign-in method</legend>
        <label>
          <input
            type="radio"
            name="connection-method"
            value="local"
            checked={method === "local"}
            onChange={() => setMethod("local")}
          />
          Local login
        </label>
        <label>
          <input
            type="radio"
            name="connection-method"
            value="device"
            checked={method === "device"}
            onChange={() => setMethod("device")}
          />
          Device code
        </label>
      </fieldset>
      {method === "local" ? (
        <>
          <ol className="repo-settings-connect-steps">
            <li>
              Run on this Mac:
              <div className="repo-settings-command">
                <code>{command}</code>
                <CopyButton text={command} small />
              </div>
            </li>
            <li>Finish signing in with your {name} subscription.</li>
          </ol>
          <label className="repo-settings-toggle">
            <input type="checkbox" checked={finished} onChange={event => setFinished(event.target.checked)} />
            I finished signing in
          </label>
        </>
      ) : (
        <Field label={`${name} device code`} hint="Use the code from your local sign-in.">
          <input
            autoFocus
            className="repo-ui-input repo-settings-mono"
            value={code}
            onChange={event => setCode(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </Field>
      )}
    </FormCard>
  )
}

export const ModelsReady = ({ connect, codexConnected = false, empty = false }: {
  connect?: Provider
  codexConnected?: boolean
  empty?: boolean
}) => {
  const { flags, set } = useMock()
  const held = flags.host === "hosted" && flags.landing === "install"
  const [connections, setConnections] = useState<Connection[]>(() => {
    const providers: Provider[] = ["claude", "codex"]
    return providers.map(provider => {
      const connection = settings.models.find(model => model.provider === provider)
      if (provider === "codex" && codexConnected) {
        return { provider, state: "connected", account: `${repo.owner}@example.test`, plan: "Plus", connected: MOCK_NOW }
      }
      if (empty || flags.model === "none") return { provider, state: "none" }
      return connection ? { ...connection } : { provider, state: "none" }
    })
  })
  const [connecting, setConnecting] = useState<Provider | null>(connect && !(connect === "codex" && codexConnected) ? connect : null)
  const [disconnecting, setDisconnecting] = useState<Provider | null>(null)
  useSettingsCommands({
    "model.connect": {
      purpose: "Connect a model subscription",
      fields: [{ name: "provider", label: "Provider", options: ["claude", "codex"] }],
      confirm: false,
      run: ({ provider }, context) => {
        if (held) {
          toast("On smithers.sh, model connections arrive with hosted runs. Locally, smthrs uses your Claude Code or Codex login.")
        } else if (connections.some(connection => connection.provider === provider && connection.state === "connected")) {
          toast(`${providerName(provider as Provider)} is already connected.`)
        } else {
          setConnecting(provider as Provider)
        }
        context.closeAsk()
      }
    },
    "model.disconnect": {
      purpose: "Disconnect a model subscription",
      fields: [{ name: "provider", label: "Provider", options: ["claude", "codex"] }],
      confirm: false,
      run: ({ provider }, context) => {
        if (held) throw new Error("Manage model connections on your local install.")
        if (!connections.some(connection => connection.provider === provider && connection.state === "connected")) {
          throw new Error("This model is not connected.")
        }
        setDisconnecting(provider as Provider)
        context.closeAsk()
      }
    }
  })
  return (
    <>
      <SettingsHeading title="Models" />
      {held && <ModelsHeld />}
      {!held && connecting && (
        <ConnectModel
          key={connecting}
          provider={connecting}
          onCancel={() => setConnecting(null)}
          onConnect={() => {
            setConnections(current => current.map(connection => connection.provider === connecting
              ? {
                ...connection,
                state: "connected",
                account: `${repo.owner}@example.test`,
                plan: connecting === "claude" ? "Max" : "Plus",
                connected: MOCK_NOW
              } : connection))
            set({ model: "connected" })
            setConnecting(null)
            toast(`${providerName(connecting)} connected.`)
          }}
        />
      )}
      <div className="repo-settings-models">
        {[...connections].sort((a, b) => Number(a.state === "connected") - Number(b.state === "connected")).map(connection => {
          const name = providerName(connection.provider)
          const connected = connection.state === "connected" && !held
          const account = connection.account?.includes("@")
            ? connection.account : `${connection.account ?? repo.owner}@example.test`
          return (
            <Box className="repo-settings-model" key={connection.provider}>
              <div className="repo-settings-model-top">
                <h2>{name}</h2>
                {connected && (
                  <span className="repo-settings-connected">
                    <StateIcon state="success" />
                    Connected
                  </span>
                )}
              </div>
              <div className="repo-settings-model-account">
                {held ? <p className="repo-settings-muted">Use your local {name} login.</p> : connected ? (
                  <>
                    <strong>{account}</strong>
                    <p className="repo-settings-muted">{connection.plan ?? "Subscription"} plan</p>
                    <p className="repo-settings-muted">Connected {fmtDate(connection.connected ?? MOCK_NOW)}</p>
                  </>
                ) : <p className="repo-settings-muted">No subscription connected.</p>}
              </div>
              <ModelUsage provider={connection.provider} />
              {!held && (
                <div className="repo-settings-model-action">
                  {connected ? (
                    <button
                      className="repo-ui-btn repo-ui-btn-quiet repo-settings-danger-button"
                      title={`/model.disconnect ${connection.provider}`}
                      onClick={() => setDisconnecting(connection.provider)}
                    >
                      Disconnect
                    </button>
                  ) : connecting !== connection.provider && (
                    <button
                      className={`repo-ui-btn${connection.provider === "codex" && !connecting ? " repo-ui-btn-primary" : ""}`}
                      title={`/model.connect ${connection.provider}`}
                      onClick={() => setConnecting(connection.provider)}
                    >
                      Connect {name}
                    </button>
                  )}
                </div>
              )}
            </Box>
          )
        })}
      </div>
      {!held && disconnecting && (
        <ConfirmCard
          title={`Disconnect ${providerName(disconnecting)}?`}
          detail="Agents using this connection will need a new connection before their next run."
          command={`/model.disconnect ${disconnecting}`}
          label="Disconnect"
          onCancel={() => setDisconnecting(null)}
          onConfirm={() => {
            setConnections(current => current.map(connection => connection.provider === disconnecting
              ? { provider: connection.provider, state: "none" } : connection))
            if (!connections.some(connection => connection.provider !== disconnecting && connection.state === "connected")) {
              set({ model: "none" })
            }
            setDisconnecting(null)
            toast("Model disconnected.")
          }}
        />
      )}
    </>
  )
}

export const ModelsConnectedBoth = () => <ModelsReady codexConnected />
export const ModelsEmpty = () => <ModelsReady empty />
