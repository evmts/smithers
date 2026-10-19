import type { FlowEntry } from "../types"

/** Product obligations, not implementation or passing-test claims. */
export const flows: readonly FlowEntry[] = [
  {
    "id": "todo.open",
    "title": "Read the TODO prompt state steps and evidence",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo",
      "todo.read"
    ]
  },
  {
    "id": "todo.create",
    "title": "Draft place and commit a TODO",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.new"
    ]
  },
  {
    "id": "todo.from.issue",
    "title": "Draft a TODO from GitHub discussion",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.from-issue"
    ]
  },
  {
    "id": "todo.label.admit",
    "title": "Admit an issue’s captured revision once from its todo label",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.read"
    ]
  },
  {
    "id": "todo.amend",
    "title": "Amend an existing TODO prompt",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.amend"
    ]
  },
  {
    "id": "todo.drop",
    "title": "Drop a TODO and retain recoverable work",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.drop"
    ]
  },
  {
    "id": "todo.steer",
    "title": "Steer the coding agent",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.steer"
    ]
  },
  {
    "id": "todo.answer",
    "title": "Answer the coding agent’s question",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.answer"
    ]
  },
  {
    "id": "todo.stop",
    "title": "Pause a TODO",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.stop"
    ]
  },
  {
    "id": "todo.resume",
    "title": "Resume from the last finished step",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.resume"
    ]
  },
  {
    "id": "todo.retry",
    "title": "Retry with the pinned flow version",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.retry"
    ]
  },
  {
    "id": "todo.retry.current.flow",
    "title": "Retry with the active flow version",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.retry-current-flow"
    ]
  },
  {
    "id": "todo.takeover",
    "title": "Take over a removed member’s TODO",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.takeover"
    ]
  },
  {
    "id": "todo.draft.discard",
    "title": "Discard the author’s private uncommitted draft",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "draft.discard"
    ]
  },
  {
    "id": "stack.open",
    "title": "Read the shared stack and filter counts",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "stack"
    ]
  },
  {
    "id": "stack.move",
    "title": "Reorder queued work",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "stack.move"
    ]
  },
  {
    "id": "stack.parallel",
    "title": "Run several TODOs on separate branches",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "stack.candidate"
    ]
  },
  {
    "id": "stack.merge",
    "title": "Review and squash-merge the next exact revision",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "merge",
      "merge.confirm"
    ]
  },
  {
    "id": "stack.preapprove",
    "title": "Pre-approve a TODO’s pull request merge",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.preapprove"
    ]
  },
  {
    "id": "stack.unapprove",
    "title": "Remove pre-approval before merge",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "todo.unapprove"
    ]
  },
  {
    "id": "stack.out.of.order",
    "title": "Acknowledge an out-of-order GitHub merge",
    "spec": [
      "§6.6",
      "J2",
      "J4",
      "J7"
    ],
    "operations": [
      "order.ok"
    ]
  }
]
