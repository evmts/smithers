import { Toast, ToastStack } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { useStatus } from "./StatusContext"

// The needs-you toasts (decision 0015, 0009 §4): one per open question, gold, with its first line, Answer, which brings
// its card into view and focuses it, and Hide, which keeps the card and the header pill. Each fades in after 300 ms, so
// a question answered at once never flashes. The stack sits where the shell renders it, under the header.
export function NeedsYouToasts() {
  const { queries, actions } = useStatus()
  const { data: needs } = useLiveQuery(queries.needs)
  return (
    <ToastStack label="Smithers" placement="inline">
      {needs
        .filter((need) => !need.hidden)
        .map((need) => (
          <Toast
            key={`${need.id}:${need.version}`}
            tone="needs_you"
            delayed
            detail={need.wait?.prompt.split("\n", 1)[0]}
            action={{ label: "Answer", onAction: () => actions.focus(need.id) }}
            onHide={() => actions.hide(need.id)}
            data-run={need.id}
          />
        ))}
    </ToastStack>
  )
}
