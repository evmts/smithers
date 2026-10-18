import { useState } from "react"
import type { StackItem } from "../../fixtures/types"
import { currentStack, useLocal, now } from "../pulls/shared"
import { useMock } from "../../../core/mock"
import { Link, useLocation } from "../../../core/router"
import { repo, to } from "../../fixtures"
import { Empty, Failed, Loading, SignInWall, useView } from "../../frame"
import { ViewFrame as RepoFrame } from "../checklist/ViewFrame"
import { Box, Counter, Icon, PersonChip, RelTime, Row } from "../../ui"
import { useWaitingOnYou } from "../../frame/waiting"
import { ApprovalCard, useRunRecords, viewerLogin, ConfirmCard } from "./shared"

export const ApprovalsLoading = () => <Loading variant="detail" rows={6} />
export const ApprovalsError = () => (
  <Failed what="approvals" reason="The decision inbox didn't respond. Pending decisions haven't loaded." />
)
export const ApprovalsEmpty = () => (
  <Empty title="Nothing is waiting on you." action={<Link className="repo-ui-btn" to={to("runs")}>All runs</Link>} />
)
export const ApprovalsSignedOut = () => <SignInWall act="see your approvals" />

const StackQuestion = ({ item }: { item: StackItem }) => {
  const { flags } = useMock()
  const [, setItems] = useLocal("stack", currentStack())
  const { decisions, decide } = useRunRecords()
  const [choice, setChoice] = useState<string | null>(null)
  const writable = flags.as === "in" && flags.role === "member" && item.owner === viewerLogin()
  const answer = () => {
    if (!writable || !choice || !item.question?.options.includes(choice)) return
    const approval = decisions.find(value => value.run === item.run && value.state === "waiting" && value.askedOf === viewerLogin())
    if (approval && approval.options.includes(choice)) decide(approval, choice)
    setItems(items => items.map(value => value.id === item.id ? { ...value, state: "working", question: undefined, updated: now() } : value))
    setChoice(null)
  }
  return <Box className="repo-runs-stack-question" header={<Link to={to("stack")}>{item.title}</Link>}>
    <div className="repo-runs-card-body"><p>{item.question?.text}</p><div className="repo-runs-approval-by">Asked of <PersonChip login={item.owner} /> · <RelTime date={item.updated} /></div>
      {choice && writable ? <ConfirmCard question="Record this decision?" command={`/stack.answer ${item.id} ${choice}`} label="Confirm decision" onClose={() => setChoice(null)} onConfirm={answer}><p>{choice}</p></ConfirmCard>
        : <div className="repo-ui-actions">{item.question?.options.map(option => <button key={option} className="repo-ui-btn" title={`/stack.answer ${item.id} ${option}`} disabled={!writable} onClick={() => setChoice(option)}>{option}</button>)}</div>}
      {!writable && <p className="repo-ui-muted">{item.owner === viewerLogin() ? "Members only" : `Waiting on ${item.owner}.`}</p>}
    </div>
  </Box>
}

export const ApprovalsReady = () => {
  const location = useLocation()
  const everyone = new URLSearchParams(location.split("?")[1]).get("filter") === "everyone"
  const { decisions, decide } = useRunRecords()
  const viewer = viewerLogin()
  const { pending, stackQuestions, reviewRequests, total } = useWaitingOnYou(everyone)
  const recent = decisions.filter(item => item.state !== "waiting" && (everyone || item.askedOf === viewer))
    .sort((a, b) => (b.decided?.date ?? b.asked).localeCompare(a.decided?.date ?? a.asked))
  return (
    <div className="repo-runs-inbox">
      <div className="repo-runs-page-heading">
        <h1>Waiting on you <Counter>{total}</Counter></h1>
        <nav className="repo-runs-filters" aria-label="Whose approvals">
          <Link className="repo-runs-filter" to={to("approvals")} aria-current={!everyone ? "page" : undefined}>Mine</Link>
          <Link className="repo-runs-filter" to={to("approvals?filter=everyone")} aria-current={everyone ? "page" : undefined}>
            Everyone's
          </Link>
        </nav>
      </div>
      {!total && <ApprovalsEmpty />}
      {pending.length > 0 && (
        <section className="repo-runs-inbox-section" aria-label="Run approvals">
          <h2>Run approvals <Counter>{pending.length}</Counter></h2>
          {pending.map(item => <ApprovalCard key={item.id} item={item} decide={decide} />)}
        </section>
      )}
      {stackQuestions.length > 0 && (
        <section className="repo-runs-inbox-section" aria-label="Stack decisions">
          <h2>Stack <Counter>{stackQuestions.length}</Counter></h2>
          {stackQuestions.map(item => <StackQuestion key={item.id} item={item} />)}
        </section>
      )}
      {reviewRequests.length > 0 && (
        <section className="repo-runs-inbox-section" aria-label="Requested reviews">
          <h2>Reviews requested <Counter>{reviewRequests.length}</Counter></h2>
          <Box>
            {reviewRequests.map(item => (
              <Row key={item.n} className="repo-runs-inbox-row">
                <Icon name="change" size={17} />
                <div>
                  <Link className="repo-runs-row-title" to={to(`pull/${item.n}`)}>{item.title}</Link>
                  <p>#{item.n} · {item.author} requested a review</p>
                </div>
                <Link className="repo-ui-btn" to={to(`pull/${item.n}`)}>Review</Link>
              </Row>
            ))}
          </Box>
        </section>
      )}
      {recent.length > 0 && (
        <section className="repo-runs-inbox-section" aria-label="Recent decisions">
          <h2>Decided recently</h2>
          <Box>
            {recent.map(item => (
              <Row className="repo-runs-recent-row" key={item.id}>
                <span className={`repo-runs-decision-icon repo-runs-decision-${item.state}`}>
                  <Icon name={item.state === "approved" ? "check" : "x"} size={16} />
                </span>
                <div>
                  <Link className="repo-runs-row-title" to={to(`runs/${item.run}`)}>{item.title}</Link>
                  <p>{item.decided?.option} · {item.decided?.by}</p>
                </div>
                <RelTime date={item.decided?.date ?? item.asked} />
              </Row>
            ))}
          </Box>
        </section>
      )}
    </div>
  )
}

export const Approvals = () => {
  const state = useView(`approvals:${repo.slug}`)
  const { flags } = useMock()
  return (
    <RepoFrame tab="runs" title={`Approvals · ${repo.slug}`} askView="runs" askContext={`${repo.slug} pending decisions`}>
      {flags.as === "out" ? <ApprovalsSignedOut />
        : state === "loading" ? <ApprovalsLoading />
        : state === "error" ? <ApprovalsError />
        : state === "empty" ? <ApprovalsEmpty />
        : <ApprovalsReady key={repo.slug} />}
    </RepoFrame>
  )
}
