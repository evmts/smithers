import { useState } from "react"
import { repo, settings } from "../../fixtures"
import { Box } from "../../ui"
import { Save, SettingsHeading, useDraft, useSettingsCommands } from "./shared"

export const ReportingReady = ({ empty = false }: { empty?: boolean }) => {
  const draft = useDraft(empty ? "off" : settings.reporting)
  const [initialized, setInitialized] = useState(!empty)
  useSettingsCommands({
    "reporting.set": {
      purpose: "Set who can file reports",
      fields: [{ name: "mode", label: "Who can report", options: ["off", "signed-in"] }],
      confirm: false,
      run: ({ mode }) => draft.setValue(mode === "off" ? "off" : "signed-in")
    }
  })
  return (
    <>
      <SettingsHeading title="Reporting">
        <Save form="repo-settings-reporting" dirty={!initialized || draft.dirty} section="reporting" />
      </SettingsHeading>
      <form
        id="repo-settings-reporting"
        className="repo-settings-form"
        onSubmit={event => {
          event.preventDefault()
          draft.save()
          setInitialized(true)
        }}
      >
        <fieldset className="repo-settings-fieldset">
          <legend>Who can file reports from the app?</legend>
          <label className="repo-settings-radio">
            <input
              type="radio"
              name="reporting"
              value="off"
              checked={draft.value === "off"}
              title="/reporting.set off"
              onChange={() => draft.setValue("off")}
            />
            <span>Off</span>
          </label>
          <label className="repo-settings-radio">
            <input
              type="radio"
              name="reporting"
              value="signed-in"
              checked={draft.value === "signed-in"}
              title="/reporting.set signed-in"
              onChange={() => draft.setValue("signed-in")}
            />
            <span>Signed-in people</span>
          </label>
        </fieldset>
        <p className="repo-settings-muted">{draft.value === "off" ? "Reporting from the app is off." : "Signed-in people can file reports from the app."}</p>
      </form>
      <Box className="repo-settings-explanation">
        <h2>What becomes public</h2>
        <p>
          {repo.visibility === "public" ? "Reports and attachments are public. Keep secrets out." : "Reports and attachments are visible to people with repository access. Keep secrets out."}
        </p>
      </Box>
    </>
  )
}
