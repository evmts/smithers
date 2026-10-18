import { useEffect, useReducer } from "react"
import { approvals, people, pulls, repo, stack } from "../fixtures"
import type { Approval, Pull, StackItem } from "../fixtures/types"
export const inboxChanged = "repo-inbox-change"
const read = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "null") ?? fallback } catch { return fallback }
}
export const sameDecision = (item: StackItem, decision: Approval) => Boolean(item.run && item.run === decision.run
  && item.owner === decision.askedOf && item.question?.text === decision.question)
export const decisionStackItems = () => read<StackItem[]>(`repo-pulls-v1:${repo.slug}:stack`, stack)
export const resolveStackDecision = (decision: Approval) => {
  const items = decisionStackItems().map(item => sameDecision(item, decision)
    ? { ...item, state: "working" as const, question: undefined, updated: decision.decided?.date ?? item.updated } : item)
  try { sessionStorage.setItem(`repo-pulls-v1:${repo.slug}:stack`, JSON.stringify(items)) } catch { /* Session-only state. */ }
  window.dispatchEvent(new Event(inboxChanged))
}
export const waitingOnYou = (everyone = false) => {
  const viewer = people.find(person => person.role === "owner")?.login ?? repo.owner
  const changes = read<{ approvals: Record<string, Approval> }>(`repo-runs:${repo.slug}`, { approvals: {} })
  const decisions = approvals.map(item => changes.approvals[item.id] ?? item)
  const pending = decisions.filter(item => item.state === "waiting" && (everyone || item.askedOf === viewer))
  const items = decisionStackItems()
  const stackQuestions = items.filter(item => item.state === "needs-answer" && (everyone || item.owner === viewer)
    && !decisions.some(decision => sameDecision(item, decision)))
  const reviewRequests = pulls.map(item => read<Pull>(`repo-pulls-v1:${repo.slug}:pull:${item.n}`, item)).filter(item =>
    ["open", "draft"].includes(item.state) && (item.reviewers.length ? item.reviewers : item.agent ? [item.agent.for] : []).some(login => (everyone || login === viewer)
      && !item.reviews.some(review => review.author === login && review.state !== "commented")))
  return { pending, stackQuestions, reviewRequests, total: pending.length + stackQuestions.length + reviewRequests.length }
}
export const useWaitingOnYou = (everyone = false) => {
  const [, refresh] = useReducer(value => value + 1, 0)
  useEffect(() => {
    const update = () => refresh()
    window.addEventListener("repo-runs-local-change", update)
    window.addEventListener(inboxChanged, update)
    return () => { window.removeEventListener("repo-runs-local-change", update); window.removeEventListener(inboxChanged, update) }
  }, [])
  return waitingOnYou(everyone)
}
