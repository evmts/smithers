import { Link } from "../../../core/router"
import { flows, to } from "../../fixtures"
import { Empty } from "../../frame"
import { Save, SettingsHeading, Toggle, useDraft, useSettingsCommands } from "./shared"

export const TriggersEmpty = () => <Empty title="No flow triggers." action={<Link className="repo-ui-btn repo-ui-btn-primary" to={to("flows")}>Open flows</Link>}><p>Set triggers in a flow.</p></Empty>

export const TriggersReady = ({ empty = false }: { empty?: boolean }) => {
  const draft = useDraft(empty ? [] : flows.flatMap(flow => flow.triggers.map((trigger, index) => ({
    ...trigger,
    flow: flow.name,
    id: `${flow.name}:${index}`
  }))))
  useSettingsCommands({
    "triggers.set": {
      purpose: "Set a flow trigger",
      fields: [
        { name: "trigger", label: "Trigger", options: draft.value.map(trigger => trigger.id) },
        { name: "enabled", label: "Enabled", options: ["on", "off"] }
      ],
      confirm: false,
      run: ({ trigger: id, enabled }) => {
        const trigger = draft.value.find(item => item.id === id)
        if (!trigger) throw new Error("Trigger not found.")
        draft.setValue(current => current.map(item => item.id === trigger.id
          ? { ...item, enabled: enabled === "on" } : item))
      }
    }
  })
  return (
    <>
      <SettingsHeading title="Triggers">
        {draft.value.length > 0 && <Save form="repo-settings-triggers" dirty={draft.dirty} section="triggers" />}
      </SettingsHeading>
      <form
        id="repo-settings-triggers"
        onSubmit={event => {
          event.preventDefault()
          draft.save()
        }}
      >
        {draft.value.length === 0 ? <TriggersEmpty /> : (
          <table className="repo-settings-table">
            <thead>
              <tr>
                <th scope="col">Flow</th>
                <th scope="col">Kind</th>
                <th scope="col">Spec</th>
                <th scope="col">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {draft.value.map(trigger => (
                <tr key={trigger.id}>
                  <th scope="row" data-label="Flow">
                    <Link to={to(`flows/${trigger.flow}`)}>{trigger.flow}</Link>
                  </th>
                  <td data-label="Kind">{trigger.kind}</td>
                  <td data-label="Spec"><code>{trigger.spec || "Manual"}</code></td>
                  <td data-label="Enabled">
                    <Toggle
                      label={`${trigger.flow} ${trigger.kind}`}
                      checked={trigger.enabled}
                      command={`/triggers.set ${trigger.id} ${trigger.enabled ? "off" : "on"}`}
                      onChange={enabled => draft.setValue(current => current.map(item => item.id === trigger.id
                        ? { ...item, enabled } : item))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </form>
    </>
  )
}
