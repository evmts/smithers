import { Button, Card, CardContent, CardFooter, CardHeader, CardTitle, EmptyState, Textarea } from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { codeSaveable } from "../actions"
import { COULDNT_READ_FLOW, NEEDS_SANDBOX, NO_SUCH_FLOW, SAVE, writeRefusalWords } from "../contract"
import { placementOf, SOURCE_PATH } from "../source"
import { useFlowsUi } from "./FlowsUiContext"

// A flow's code (decision 0014 §1, `/app/flows/code/$name`): its flow.ts to read and edit, and Save, which makes the
// edit the flow's next revision. Code that is no longer the flow as drafted says it needs a sandbox, before and after
// Save; a refused Save says why.
export function FlowCodeCard() {
  const { queries, actions } = useFlowsUi()
  const { data: code } = useLiveQuery(queries.code)
  if (code === undefined || code.state === "loading") return null
  if (code.state !== "read") return <EmptyState title={code.state === "not_found" ? NO_SUCH_FLOW : COULDNT_READ_FLOW} />
  return (
    <Card aria-label={code.name} className="flows-code">
      <CardHeader>
        <CardTitle>{code.name}</CardTitle>
        <span>{SOURCE_PATH}</span>
      </CardHeader>
      <CardContent>
        <Textarea
          code
          aria-label="Code"
          rows={28}
          value={code.text}
          onChange={(event) => actions.editCode(event.currentTarget.value)}
        />
        {placementOf(code.text) === "sandbox" ? <p role="status">{NEEDS_SANDBOX}</p> : null}
        {code.refusal === null ? null : <p role="alert">{writeRefusalWords(code.refusal)}</p>}
      </CardContent>
      <CardFooter>
        <Button disabled={!codeSaveable(code)} onClick={actions.saveCode}>{SAVE}</Button>
      </CardFooter>
    </Card>
  )
}
