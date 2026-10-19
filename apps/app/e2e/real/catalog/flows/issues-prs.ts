import type { FlowEntry } from "../types"

/** Product obligations, not implementation or passing-test claims. */
export const flows: readonly FlowEntry[] = [
  {
    "id": "issue.list",
    "title": "List GitHub issues",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "issues",
      "issues.list"
    ],
    "issues": [
      4320
    ]
  },
  {
    "id": "issue.open",
    "title": "Read a GitHub issue and discussion",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "issue",
      "issues.view"
    ]
  },
  {
    "id": "issue.create",
    "title": "Create a GitHub issue",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "issue.new"
    ]
  },
  {
    "id": "issue.comment",
    "title": "Comment on a GitHub issue",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "issue.comment"
    ]
  },
  {
    "id": "issue.close",
    "title": "Close a GitHub issue",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "issues.close"
    ]
  },
  {
    "id": "issue.reopen",
    "title": "Reopen a GitHub issue",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "issues.reopen"
    ]
  },
  {
    "id": "pr.open",
    "title": "Read a pull request diff checks and evidence",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "pr",
      "diff"
    ]
  },
  {
    "id": "pr.review",
    "title": "Run the repository review flow",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "review"
    ]
  },
  {
    "id": "pr.verdict",
    "title": "Submit a person’s GitHub review at the reviewed head",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "prs.review",
      "github.account-review"
    ]
  },
  {
    "id": "pr.review.steer",
    "title": "Receive GitHub review comments as steers",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "todo.steer"
    ]
  },
  {
    "id": "pr.checks",
    "title": "Refresh checks and hold blocked merges",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "pr"
    ]
  },
  {
    "id": "pr.external.merge",
    "title": "Reconcile a pull request merged on GitHub",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "todo.read"
    ]
  },
  {
    "id": "pr.external.close",
    "title": "Reconcile close and reopen on GitHub",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "todo.read"
    ]
  },
  {
    "id": "pr.foreign.push",
    "title": "Bring in or discard a teammate’s pushed commit",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "branch.bring-in",
      "branch.discard-foreign"
    ]
  },
  {
    "id": "pr.finding.fix",
    "title": "Steer from a review finding",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "findings.please-fix"
    ]
  },
  {
    "id": "pr.finding.dismiss",
    "title": "Mark a review finding not useful",
    "spec": [
      "§6.3",
      "J2",
      "J10"
    ],
    "operations": [
      "findings.not-useful"
    ]
  },
  {
    "id": "issue.transition",
    "title": "Run repository-defined issue state transitions",
    "spec": [
      "§6.17",
      "M-47"
    ],
    "operations": [
      "issues.transition"
    ],
    "issues": [
      4067,
      4068
    ]
  },
  {
    "id": "pr.review.lenses",
    "title": "Inspect the review lenses and verified findings",
    "spec": [
      "C.2",
      "J10"
    ],
    "operations": [
      "run.inspect"
    ]
  }
]
