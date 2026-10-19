import { createPortal } from "react-dom"
import { useLiveQuery } from "@tanstack/react-db"
import { useController } from "../ControllerContext"
import { flowAction } from "../flows/FlowAction"
import { describedFailure, FailureNotice } from "../FailureNotice"
import { flowArgs } from "../flows/FlowArgs"
import { deriveHostedChange, type HostedObservation } from "../state/seams/HostedChange"
import type { CardFamily, RunCommand } from "./CardFamily"
import "./HostedChangeCard.css"

// These stored sentences are authored by the hosted-change seam from typed refusals.
const hostedRequestFailure = (sentence: string) => describedFailure("HostedChangeRequest", { fault: "dependency", sentence, actions: [] }, "")

const TestingText = ({ testing }: { testing: ReturnType<typeof deriveHostedChange>["testing"] }) =>
  testing.command ? <><code>{testing.command}</code>{testing.text.slice(testing.command.length)}</> : <>{testing.text}</>

export const HostedChangeView = ({ row, run: runCommand }: { row: HostedObservation; run: RunCommand }) => {
  const view = deriveHostedChange(row)
  const running = row.phase === "starting" || row.phase === "running"
  const noChange = row.noChange || (row.phase === "done" && row.filesRead === true && row.files.length === 0)
  const counted =
    row.files.length > 0 && row.files.every((file) => file.additions !== undefined && file.deletions !== undefined)
  const open = flowAction(runCommand, "change.open-pull", flowArgs("change.open-pull", { repo: row.repo, session: row.id }))
  if (row.phase === "failed")
    return (
      <section className="hosted-change-card" aria-label="Agent run">
        <p role="alert">{view.reason}</p>
        {view.retryable && (
          <button
            className="repo-ui-btn repo-ui-btn-primary"
            {...flowAction(runCommand, "change.ask", flowArgs("change.ask", { repo: row.repo, request: row.request }))}
          >
            Try again
          </button>
        )}
      </section>
    )
  return (
    <div className="hosted-change-thread">
      <section className="hosted-change-card" aria-label="Agent run">
        <header>
          <strong>{row.request}</strong>
          <span className="hosted-change-chip" data-tone={running ? "running" : view.testing.tested && !view.testing.passed && row.result?.test_receipt ? "failed" : undefined}>
            {row.phase === "starting"
              ? "Requested"
              : running
                ? "Running"
                : !view.testing.tested || view.testing.passed
                  ? "Done"
                  : row.result?.test_receipt?.tests_run === 0
                    ? "Tests failed"
                    : row.result?.test_receipt
                      ? "Tests failed"
                      : "Done"}
          </span>
        </header>
        {(view.model || view.finished || (running && row.observedAt !== undefined && row.session?.run?.started_at)) && (
          <div className="hosted-change-meta">{[view.model, view.finished ?? (running && row.observedAt !== undefined && row.session?.run?.started_at ? `started just now · ${Math.max(0, Math.floor((row.observedAt - Date.parse(row.session.run.started_at)) / 1000))} s` : null)].filter(Boolean).join(" · ").split(" · ").map((segment, index) => <span key={index}>{index > 0 && " · "}<span className="hosted-change-meta-segment">{segment}</span></span>)}</div>
        )}
        {view.stages.map((stage) => {
          const detail =
            stage.label === "Testing" && row.result
              ? view.testing.text
              : stage.label === "Model working"
                ? row.activity
                : undefined
          const contents = (
            <>
              <i aria-hidden="true" />
              <span>{stage.label}</span>
              {stage.duration && <span className="hosted-change-duration">{stage.duration}</span>}
              {detail && (
                <svg
                  data-stage-chevron
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path d="m3 4.5 3 3 3-3" />
                </svg>
              )}
            </>
          )
          return detail ? (
            <details
              open={stage.tone === "live" || (!running && stage.label === "Testing")}
              className="hosted-change-stage"
              data-tone={stage.tone}
              key={stage.label}
            >
              <summary className="hosted-change-stage-row">{contents}</summary>
              <div className="hosted-change-detail">{stage.label === "Testing" ? <TestingText testing={view.testing} /> : detail}</div>
            </details>
          ) : (
            <div className="hosted-change-stage" data-tone={stage.tone} key={stage.label}>
              <div className="hosted-change-stage-row">{contents}</div>
            </div>
          )
        })}
        {running && row.error && <FailureNotice failure={hostedRequestFailure(row.error)} />}
        {running && <footer>Keeps running if you close this tab.</footer>}
      </section>
      {row.phase === "done" && noChange && <section className="hosted-change-card" aria-label="Change outcome"><strong>No change made</strong>{row.outcome && <p>{row.outcome}</p>}<p><TestingText testing={view.testing} /></p></section>}
      {row.phase === "done" && row.result && !noChange && (
        <section className="hosted-change-card" aria-label="Change diff">
          <header>
            {row.filesRead !== false && (
              <strong>
                {row.files.length} files changed{" "}
                {counted && (
                  <>
                    <span className="hosted-change-added">
                      +{row.files.reduce((n, file) => n + (file.additions ?? 0), 0)}
                    </span>{" "}
                    −{row.files.reduce((n, file) => n + (file.deletions ?? 0), 0)}
                  </>
                )}
              </strong>
            )}
            <button
              className="repo-ui-btn repo-ui-btn-quiet"
              {...flowAction(runCommand, "diff", flowArgs("diff", { operation: "hosted-change", cardId: row.id }))}
            >
              View diff
            </button>
          </header>
          {row.filesError && <FailureNotice failure={hostedRequestFailure(row.filesError)} />}
          {row.files.map((file) => (
            <div className="hosted-change-file" key={file.path}>
              <code>{file.path}</code>
              {file.additions !== undefined && file.deletions !== undefined && (
                <span>
                  +{file.additions}
                  {file.deletions !== 0 && ` −${file.deletions}`}
                </span>
              )}
            </div>
          ))}
          <p><TestingText testing={view.testing} /></p>
          {view.testing.note && (
            <p>
              {view.testing.tested && row.result?.test_receipt && row.result.test_receipt.exit_code !== 0 ? (
                <>
                  <span className="hosted-change-failure">
                    Tests failed (exit {row.result.test_receipt.exit_code}).
                  </span>{" "}
                  You can still open a pull request; the failure goes in its description.
                </>
              ) : (
                view.testing.note
              )}
            </p>
          )}
          {!row.pull && (
            <button className={`repo-ui-btn${view.testing.passed ? " repo-ui-btn-primary" : ""}`} {...open}>
              Open pull request
            </button>
          )}
          {!row.pull && row.error && (
            <div role="alert">
              <FailureNotice failure={hostedRequestFailure(row.error)} />
              <button className="repo-ui-btn" {...open}>
                Retry
              </button>
            </div>
          )}
        </section>
      )}
      {row.pull && (
        <section className="hosted-change-card hosted-change-pull">
          <p>
            Pull request #{row.pull.pull_number} opened on GitHub from <code>{row.pull.branch}</code>.
          </p>
          {!row.merged && (
            <p>main is unchanged.{view.testing.passed && " Your review is next."}</p>
          )}
          {row.merged ? (
            <p>
              Merged on GitHub{row.merged.by ? ` by ${row.merged.by}` : ""}.
              {row.merged.commit && (
                <>
                  {" "}
                  main is now{" "}
                  <a
                    href={`https://github.com/${row.repo}/commit/${row.merged.commit}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {row.merged.commit.slice(0, 7)}
                  </a>
                  .
                </>
              )}
            </p>
          ) : (
            <div className="hosted-change-pull-actions">
              <a
                className="repo-ui-btn repo-ui-btn-primary"
                href={row.pull.pull_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Merge on GitHub ↗
              </a>{" "}
              <a className="repo-ui-btn repo-ui-btn-quiet" href={row.pull.pull_url} target="_blank" rel="noopener noreferrer">
                View #{row.pull.pull_number}
              </a>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
const HostedChangeBody = ({ id }: { id: string }) => {
  const controller = useController()
  const sessions = useLiveQuery(controller.store.collections.sessions).data
  const row = sessions
    .find((session) => session.id === "main")
    ?.hostedChanges?.find((item) => `hosted-change-${item.id}` === id)
  const target = typeof document === "undefined" ? null : document.getElementById("repo-content")
  return row ? (
    <>
      <HostedChangeView row={row} run={controller.runCommand} />
      <div id={`${id}-end`} />
      {row.diffOpen &&
        target &&
        createPortal(
          <section className="hosted-change-main-diff" data-keyboard-pane="Change diff">
            <header>
              <h2>{row.pull?.branch ?? row.request}</h2>
              <button
                className="repo-ui-btn"
                {...flowAction(controller.runCommand, "diff", flowArgs("diff", { operation: "hosted-change", cardId: row.id }))}
              >
                Close diff
              </button>
            </header>
            <pre>{row.diff}</pre>
          </section>,
          target
        )}
    </>
  ) : null
}
export const hostedChangeCardFamily: CardFamily<"hosted-change"> = {
  "hosted-change": { render: (card) => <HostedChangeBody id={card.id} />, pill: () => "" }
}
