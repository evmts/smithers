import { ActionMenu, Badge } from "@smthrs/ui"
import { COMMITMENTS, COMMITMENT_COPY, type Commitment } from "../lifecycle"

/** An issue lifecycle contribution: reads data and dispatches the same public flow as the command. */
export function CommitmentControl({ value, onChange, pending }: {
  readonly pending?: string
  readonly value?: string | null
  readonly onChange?: (commitment: Commitment) => void
}) {
  const word = value === "conflict" ? "Commitment conflict" : COMMITMENT_COPY[value as Commitment]
  return <div role="group" aria-label="Commitment" data-commitment={value ?? "unset"}>
    {word === undefined ? null : <Badge variant="outline">{word}</Badge>}
    {pending === "not_sent" ? <Badge variant="destructive">Not sent</Badge> : pending === "requested" ? <Badge variant="muted">Requested</Badge> : null}
    {onChange === undefined ? null : <ActionMenu label="Set commitment" items={COMMITMENTS.map((commitment) => ({
      label: COMMITMENT_COPY[commitment], onSelect: () => onChange(commitment),
    }))} />}
  </div>
}
