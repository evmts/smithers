import { Toast } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import type { ReactElement } from "react"
import { ALERT_WORD, alertDetail } from "../copy"
import { useSpend } from "./SpendContext"

// The spend alerts' toasts (docs/features/spend-alerts.md): one per alert this device hasn't hidden, newest first, in
// the shell's one toast stack after the feed's (src/screens/app/Toasts.tsx). Only an Admin's devices sync any. Hide
// marks the alert and every earlier one seen on this device.
export function useSpendAlertToasts(): ReadonlyArray<ReactElement> {
  const { queries, actions } = useSpend()
  const { data: open } = useLiveQuery(queries.open)
  return open.map((alert) => (
    <Toast
      key={alert.id}
      tone="needs_you"
      word={ALERT_WORD}
      detail={alertDetail(alert)}
      onHide={() => actions.hide(alert.id)}
      data-alert={alert.id}
    />
  ))
}
