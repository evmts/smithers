import { useState } from "react"
import { MOCK_NOW, settings } from "../../fixtures"
import type { Settings } from "../../fixtures/types"
import { Empty } from "../../frame"
import { Box, RelTime, Row, toast } from "../../ui"
import { ConfirmCard, SettingsHeading, useSettingsCommands } from "./shared"

type Environment = Settings["environment"][number]

export const EnvironmentsEmpty = () => <Empty title="No environment images." />

export const EnvironmentsReady = ({ empty = false }: { empty?: boolean }) => {
  const [images, setImages] = useState(empty ? [] : settings.environment)
  const [rebuilding, setRebuilding] = useState<Environment | null>(null)
  const setDefault = (name: string) => {
    if (!images.some(image => image.name === name)) throw new Error("Environment not found.")
    setImages(current => current.map(image => ({ ...image, isDefault: image.name === name })))
    toast("Default environment changed.")
  }
  useSettingsCommands({
    "environment.default": {
      purpose: "Set the default environment",
      fields: [{ name: "name", label: "Environment name" }],
      confirm: false,
      run: ({ name }) => setDefault(name)
    },
    "environment.rebuild": {
      purpose: "Rebuild an environment image",
      fields: [{ name: "name", label: "Environment name" }],
      confirm: false,
      run: ({ name }, context) => {
        const image = images.find(image => image.name === name)
        if (!image) throw new Error("Environment not found.")
        setRebuilding(image)
        context.closeAsk()
      }
    }
  })
  return (
    <>
      <SettingsHeading title="Environments" />
      <Box>
        {images.length === 0 ? <EnvironmentsEmpty /> : images.map(image => (
          <Row className="repo-settings-row repo-settings-environment" key={image.name}>
            <div className="repo-settings-grow">
              <div className="repo-settings-inline">
                <strong>{image.name}</strong>
                {image.isDefault && <span className="repo-settings-muted">Default</span>}
              </div>
              <p className="repo-settings-mono repo-settings-image">{image.image}</p>
              <p className="repo-settings-muted">{image.size} · Updated <RelTime date={image.updated} /></p>
            </div>
            <div className="repo-ui-actions">
              {!image.isDefault && (
                <button
                  className="repo-ui-btn"
                  title={`/environment.default ${image.name}`}
                  onClick={() => setDefault(image.name)}
                >
                  Set default
                </button>
              )}
              <button
                className="repo-ui-btn"
                title={`/environment.rebuild ${image.name}`}
                onClick={() => setRebuilding(image)}
              >
                Rebuild
              </button>
            </div>
          </Row>
        ))}
      </Box>
      {rebuilding && (
        <ConfirmCard
          title={`Rebuild ${rebuilding.name}?`}
          detail="New sandboxes will use the rebuilt image. Running sandboxes keep their current image."
          command={`/environment.rebuild ${rebuilding.name}`}
          label="Rebuild image"
          onCancel={() => setRebuilding(null)}
          onConfirm={() => {
            setImages(current => current.map(image => image.name === rebuilding.name
              ? { ...image, updated: MOCK_NOW } : image))
            setRebuilding(null)
            toast("Environment image rebuilt.")
          }}
        />
      )}
    </>
  )
}
