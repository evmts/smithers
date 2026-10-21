import { ToastStack } from "@smthrs/ui"
import { useNotices } from "../../features/attention/components/Notices"
import { useSpendAlertToasts } from "../../features/spend/components/SpendAlertToasts"

// The shell's one toast stack (decision 0009 §4): the person's feed first (questions, failures, live work elsewhere,
// what finished, the repository's updates; docs/features/notifications.md), then the model spend alerts an Admin
// hasn't hidden (docs/features/spend-alerts.md). Three show, and `+N` the rest and the person's list. The home
// conversation's own runs show in it instead, unless they need the person.
export function Toasts() {
  const feed = useNotices("conversation")
  const spend = useSpendAlertToasts()
  return (
    <ToastStack label="Smithers" placement="inline" more={feed.more}>
      {feed.toasts}
      {spend}
    </ToastStack>
  )
}
