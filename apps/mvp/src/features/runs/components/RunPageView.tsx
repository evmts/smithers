import {
  Button,
  EmptyState,
  JsonValue,
  RunHeader,
  RunJournal,
  RunWaterfall,
  SpanDetail,
  SpanTree,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@smthrs/ui"
import { useLiveQuery } from "@tanstack/react-db"
import { Link } from "@tanstack/react-router"
import {
  ANSWER,
  COULDNT_READ,
  ON_ANOTHER_DEVICE,
  OPEN,
  REFUSAL_WORDS,
  RESUME,
  RETRY,
  RETRY_LATEST,
  STOP,
  THIS_DEVICE,
} from "../contract"
import { actsOf, journalOf, selectedStep, stepsOf } from "../page"
import type { Inspection, RunTab } from "../schema"
import { useRuns } from "./RunsContext"

// One run's page (decision 0014 §5): its header with Stop, Retry and Resume, then its steps with each one's input and
// output, its timeline and its journal. Every value is text the engine redacted and cut to 16 KiB before it left the
// engine; nothing here renders a value as markup.
export function RunPageView() {
  const { queries, actions } = useRuns()
  const { data } = useLiveQuery(queries.page)
  if (data === undefined) return null
  const { view, page } = data
  if (page.state !== "read") {
    return <EmptyState title={page.state === "not_found" ? ON_ANOTHER_DEVICE : COULDNT_READ} />
  }
  const inspection = page.inspection as Inspection
  const { run } = inspection
  const now = Date.now()
  const steps = stepsOf(inspection)
  const shown = selectedStep(steps, view.selected)
  const acts = actsOf(inspection, now)
  const busy = view.acting !== null
  return (
    <div className="run-page">
      <RunHeader
        title={run.flowName}
        state={run.status}
        cancelRequested={run.cancelRequestedAtMs !== null}
        startedAtMs={run.startedAtMs ?? run.createdAtMs}
        finishedAtMs={run.finishedAtMs}
        now={now}
        host={THIS_DEVICE}
        actions={
          <>
            {acts.stop ? <Button variant="outline" disabled={busy} onClick={actions.stop}>{STOP}</Button> : null}
            {acts.resume ? <Button variant="outline" disabled={busy} onClick={actions.resume}>{RESUME}</Button> : null}
            {acts.retry ? <Button disabled={busy} onClick={() => actions.retry("pinned")}>{RETRY}</Button> : null}
            {acts.retry && run.flowName === "flow/run"
              ? <Button variant="outline" disabled={busy} onClick={() => actions.retry("current")}>{RETRY_LATEST}</Button>
              : null}
            {run.waiting?.kind === "human"
              ? <Button asChild variant="outline"><Link to="/app">{ANSWER}</Link></Button>
              : null}
          </>
        }
      />
      {view.refusal === null ? null : <p role="alert">{REFUSAL_WORDS[view.refusal] ?? view.refusal}</p>}
      <div className="run-page-values">
        <JsonValue label="Input" value={run.input} />
        {run.result === null ? null : <JsonValue label="Result" value={run.result} defaultOpen />}
      </div>
      <Tabs value={view.tab} onValueChange={(tab) => actions.showTab(tab as RunTab)}>
        <TabsList>
          <TabsTrigger value="steps" count={steps.length}>Steps</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
        </TabsList>
        <TabsContent value="steps">
          <div className="run-page-steps">
            <SpanTree
              steps={steps.map((step) => step.row)}
              selected={shown?.row.id ?? null}
              onSelect={actions.select}
              now={now}
            />
            {shown === undefined ? null : (
              <SpanDetail
                label={shown.row.label}
                state={shown.row.state}
                attempts={shown.attempts}
                input={shown.input}
                output={shown.output}
                wait={shown.wait}
                now={now}
                actions={shown.href === null ? undefined : <Link to={shown.href as never}>{OPEN}</Link>}
              />
            )}
          </div>
        </TabsContent>
        <TabsContent value="timeline">
          <RunWaterfall
            steps={steps.map((step) => step.row)}
            now={now}
            selected={shown?.row.id ?? null}
            onSelect={actions.select}
          />
        </TabsContent>
        <TabsContent value="journal">
          <RunJournal events={journalOf(page)} originMs={run.createdAtMs} hasMore={page.hasMore} onMore={actions.more} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
