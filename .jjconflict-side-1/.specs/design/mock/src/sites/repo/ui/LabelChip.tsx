/* <LabelChip name="bug"/> resolves its tone from fixtures; label accepts a Label object too. */
import type { Label } from "../fixtures/types"
import { label as findLabel } from "../fixtures"
export const LabelChip = ({ name, label, tone }: { name?: string; label?: Label | string; tone?: Label["tone"] }) => {
  const value = typeof label === "object" ? label : findLabel(name ?? label ?? "")
  return <span className={`repo-ui-label repo-ui-tone-${tone ?? value?.tone ?? "neutral"}`} title={value?.description}>{name ?? (typeof label === "string" ? label : label?.name)}</span>
}
