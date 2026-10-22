import { Button, Field, Input, Label, RelativeTime } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import type { FormEvent } from "react"
import { splitDestinations, TELEGRAM_CHAT_PATTERN } from "../contract"
import { ALERTS_HEADING, CHANNEL_LABEL, NOT_SAVED, receiptText, SAVE, SAVING } from "../copy"
import type { AlertChannel, AlertChannelName, ChannelSave } from "../schema"
import { useSpend } from "./SpendContext"

// Where spend alerts go outside the app (docs/features/spend-alerts.md#channels): an Admin's email addresses and
// Telegram chat, each saved on its own, and the latest receipts. A field left empty turns its channel off. The fields
// show the synced setting until edited; a save that hasn't landed says so beside its button.
export function AlertSettings() {
  const { queries, actions } = useSpend()
  const { data: channels } = useLiveQuery(queries.channels)
  const { data: receipts } = useLiveQuery(queries.receipts)
  const { data: saves } = useLiveQuery(queries.saves)
  const channel = (name: AlertChannelName) => channels.find((row) => row.channel === name)
  const save = (name: AlertChannelName) => saves.find((row) => row.channel === name)
  return (
    <section className="alert-settings" aria-label={ALERTS_HEADING}>
      <h2>{ALERTS_HEADING}</h2>
      {(["email", "telegram"] as const).map((name) => (
        <ChannelForm
          key={name}
          name={name}
          row={channel(name)}
          save={save(name)}
          onSave={actions.setChannel}
        />
      ))}
      {receipts.length === 0 ? null : (
        <ul className="alert-settings-receipts" aria-label="Deliveries">
          {receipts.map((receipt) => (
            <li key={`${receipt.alertId}:${receipt.channel}`} data-status={receipt.status}>
              <span>{CHANNEL_LABEL[receipt.channel]}</span>
              <span>{receiptText(receipt)}</span>
              <RelativeTime ts={Date.parse(receipt.updatedAt)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ChannelForm(props: {
  readonly name: AlertChannelName
  readonly row: AlertChannel | undefined
  readonly save: ChannelSave | undefined
  readonly onSave: (channel: AlertChannelName, destinations: ReadonlyArray<string>) => void
}) {
  const id = `alert-channel-${props.name}`
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    props.onSave(props.name, splitDestinations(String(new FormData(event.currentTarget).get("destinations") ?? "")))
  }
  return (
    <form className="alert-settings-channel" aria-label={CHANNEL_LABEL[props.name]} onSubmit={submit}>
      <Field>
        <Label htmlFor={id}>{CHANNEL_LABEL[props.name]}</Label>
        <Input
          id={id}
          name="destinations"
          {...(props.name === "email"
            ? { type: "email", multiple: true, autoComplete: "email" }
            : { type: "text", pattern: TELEGRAM_CHAT_PATTERN, inputMode: "text" as const })}
          ref={(input) => {
            if (input === null) return
            const synced = props.row?.destinations.join(",") ?? ""
            // Refresh untouched fields in place, retaining any unsaved edit and its focus.
            if (input.value === input.defaultValue) input.value = synced
            input.defaultValue = synced
          }}
        />
      </Field>
      <Button type="submit" disabled={props.save?.state === "saving"}>{SAVE}</Button>
      {props.save === undefined ? null : (
        <span role="status">{props.save.state === "saving" ? SAVING : NOT_SAVED}</span>
      )}
    </form>
  )
}
