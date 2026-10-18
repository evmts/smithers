import { useState } from "react"
import { Link } from "../../../core/router"
import { branches, repo } from "../../fixtures"
import { Empty } from "../../frame"
import { Box, Row, toast } from "../../ui"
import { ConfirmCard, Field, Save, SettingsHeading, Toggle, useDraft, useSettingsCommands } from "./shared"

export const GeneralReady = () => {
  const draft = useDraft({
    name: repo.name,
    description: repo.description,
    homepage: repo.homepage ?? "",
    topics: repo.topics.join(", "),
    branch: repo.defaultBranch,
    issues: repo.config.tabs?.includes("issues") ?? true,
    wiki: repo.config.tabs?.includes("wiki") ?? true,
    docs: Boolean(repo.config.docs)
  })
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null)
  const [archived, setArchived] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const update = <K extends keyof typeof draft.value,>(key: K, value: typeof draft.value[K]) => {
    draft.setValue(current => ({ ...current, [key]: value }))
  }
  useSettingsCommands({
    "repo.archive": {
      purpose: "Archive repository",
      fields: [{ name: "repository", label: "Repository", required: false }],
      confirm: false,
      run: (_, context) => { setConfirm("archive"); context.closeAsk() }
    },
    "repo.unarchive": {
      purpose: "Unarchive repository",
      fields: [{ name: "repository", label: "Repository", required: false }],
      confirm: false,
      run: (_, context) => { setConfirm("archive"); context.closeAsk() }
    },
    "repo.delete": {
      purpose: "Delete repository",
      fields: [{ name: "repository", label: "Repository", required: false }],
      confirm: false,
      run: (_, context) => { setConfirm("delete"); context.closeAsk() }
    },
    "settings.feature": {
      purpose: "Toggle repository feature",
      fields: [{ name: "feature", label: "Feature", options: ["issues", "wiki", "docs"] }],
      confirm: false,
      run: ({ feature }) => {
        const key = feature as "issues" | "wiki" | "docs"
        update(key, !draft.value[key])
      }
    }
  })
  if (deleted) {
    return (
      <Empty
        title="Repository deleted from Smithers."
        action={<Link className="repo-ui-btn" to="smithers.sh/">Open repositories</Link>}
      />
    )
  }
  return (
    <>
      <SettingsHeading title="General">
        <Save form="repo-settings-general" dirty={draft.dirty} section="general" />
      </SettingsHeading>
      {archived && <div className="repo-settings-banner">This repository is archived.</div>}
      <form
        id="repo-settings-general"
        className="repo-settings-form"
        onSubmit={event => {
          event.preventDefault()
          draft.save()
        }}
      >
        <Field label="Repository name">
          <input
            className="repo-ui-input repo-settings-short"
            value={draft.value.name}
            onChange={event => update("name", event.target.value)}
            pattern="[A-Za-z0-9_.-]+"
            required
          />
        </Field>
        <Field label="Description">
          <textarea
            className="repo-ui-input"
            value={draft.value.description}
            onChange={event => update("description", event.target.value)}
            rows={2}
          />
        </Field>
        <Field label="Homepage">
          <input
            className="repo-ui-input"
            type="url"
            placeholder="https://"
            value={draft.value.homepage}
            onChange={event => update("homepage", event.target.value)}
          />
        </Field>
        <Field label="Topics" hint="Separate topics with commas.">
          <input
            className="repo-ui-input"
            value={draft.value.topics}
            onChange={event => update("topics", event.target.value)}
          />
        </Field>
        <Field label="Default branch">
          <select
            className="repo-ui-input repo-settings-short"
            value={draft.value.branch}
            onChange={event => update("branch", event.target.value)}
          >
            {Array.from(new Set([repo.defaultBranch, ...branches.map(branch => branch.name)])).map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </Field>
        <fieldset className="repo-settings-fieldset">
          <legend>Features</legend>
          <Toggle
            label="Issues"
            checked={draft.value.issues}
            onChange={value => update("issues", value)}
            command="/settings.feature issues"
          />
          <Toggle
            label="Wiki"
            checked={draft.value.wiki}
            onChange={value => update("wiki", value)}
            command="/settings.feature wiki"
          />
          <Toggle
            label="Docs tab"
            checked={draft.value.docs}
            onChange={value => update("docs", value)}
            command="/settings.feature docs"
          />
        </fieldset>
        <div className="repo-settings-field">
          <span>Visibility</span>
          <p className="repo-settings-muted">
            {repo.visibility === "public" ? "Public" : "Private"}, synced with GitHub
          </p>
        </div>
      </form>
      <section className="repo-settings-danger">
        <h2>Danger zone</h2>
        <Box>
          <Row className="repo-settings-row">
            <div className="repo-settings-grow">
              <strong>{archived ? "Unarchive" : "Archive"} repository</strong>
              <p className="repo-settings-muted">
                {archived ? "Allow changes again." : "Make the repository read-only."}
              </p>
            </div>
            <button
              className="repo-ui-btn repo-settings-danger-button"
              title={`/repo.${archived ? "unarchive" : "archive"} ${repo.slug}`}
              onClick={() => setConfirm("archive")}
            >
              {archived ? "Unarchive" : "Archive"}
            </button>
          </Row>
          <Row className="repo-settings-row">
            <div className="repo-settings-grow">
              <strong>Delete repository</strong>
              <p className="repo-settings-muted">Remove this repository from Smithers.</p>
            </div>
            <button
              className="repo-ui-btn repo-settings-danger-button"
              title={`/repo.delete ${repo.slug}`}
              onClick={() => setConfirm("delete")}
            >
              Delete
            </button>
          </Row>
        </Box>
      </section>
      {confirm && (
        <ConfirmCard
          key={confirm}
          title={`${confirm === "delete" ? "Delete" : archived ? "Unarchive" : "Archive"} ${repo.slug}?`}
          detail={confirm === "delete"
            ? "This removes its settings, runs and connections from Smithers. The GitHub repository stays."
            : archived ? "Members will be able to change this repository again." : "Files and history stay readable. New changes stop."}
          command={`/repo.${confirm === "delete" ? "delete" : archived ? "unarchive" : "archive"} ${repo.slug}`}
          label={confirm === "delete" ? "Delete repository" : archived ? "Unarchive repository" : "Archive repository"}
          typeName
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === "delete") {
              setDeleted(true)
              toast("Repository deleted from Smithers.")
            } else {
              setArchived(!archived)
              toast(archived ? "Repository unarchived." : "Repository archived.")
            }
            setConfirm(null)
          }}
        />
      )}
    </>
  )
}
