import { useEffect } from "react"
import { MAYA } from "../../../core/catalog"
import { navigate } from "../../../core/router"
import { repo, to } from "../../fixtures"
import type { Issue } from "../../fixtures/types"
import { registerSlash, type SlashContext, type SlashField } from "../../frame"
import { toast } from "../../ui"
import { addIssueComment, allIssues, makeTodo, setIssueClosed } from "./model"

type OpenIssueRun = (issue: Issue, act: "implement" | "repro") => void
const openIssueRun: OpenIssueRun = (issue, act) => navigate(to(`issues/${issue.n}?act=${act}`))

export const registerIssueCommands = (openRun: OpenIssueRun = openIssueRun) => {
  const issueField: SlashField = { name: "issue", label: "Issue number", type: "number", min: 1 }
  const findIssue = (value: string, { flags }: SlashContext) => {
    const n = Number(value)
    const issue = flags.data !== "empty" && Number.isInteger(n) && n > 0 && allIssues().find(item => item.n === n)
    if (!issue) throw new Error(`Issue #${value} wasn't found in this repository.`)
    return issue
  }
  const disposers = [
    ...(["implement", "repro"] as const).map(act => registerSlash(`issue.${act}`, {
      purpose: act === "implement" ? "Implement an issue" : "Reproduce an issue",
      fields: [issueField],
      confirm: false,
      run: ({ issue }, context) => {
        const target = findIssue(issue, context)
        context.closeAsk()
        openRun(target, act)
      }
    })),
    registerSlash("issue.todo", {
      purpose: "Make TODO from an issue",
      fields: [issueField],
      run: ({ issue }, context) => {
        makeTodo(findIssue(issue, context))
        toast("TODO added to the Stack.")
      }
    }),
    registerSlash("issue.close", {
      purpose: "Close an issue",
      fields: [issueField],
      access: "signed-in",
      run: ({ issue }, context) => {
        const target = findIssue(issue, context)
        if (context.flags.role !== "member" && target.author !== MAYA.login) {
          throw new Error("Only members or the issue's author can close this issue.")
        }
        setIssueClosed(target, true)
        toast("Issue closed.")
      }
    }),
    registerSlash("issue.comment", {
      purpose: "Comment on an issue",
      fields: [issueField, { name: "body", label: "Comment", type: "textarea" }],
      access: "signed-in",
      run: ({ issue, body }, context) => {
        addIssueComment(findIssue(issue, context), body)
        toast("Comment added.")
      }
    })
  ]
  return () => disposers.forEach(dispose => dispose())
}

export const useIssueCommands = (openRun?: OpenIssueRun) => {
  const slug = repo.slug
  useEffect(() => registerIssueCommands(openRun), [slug, openRun])
}
