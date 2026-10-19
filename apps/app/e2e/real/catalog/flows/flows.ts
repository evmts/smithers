import type { FlowEntry } from "../types"

/** Product obligations, not implementation or passing-test claims. */
export const flows: readonly FlowEntry[] = [
  {
    "id": "flow.list",
    "title": "List repository flows",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "flows"
    ]
  },
  {
    "id": "flow.open",
    "title": "Read steps prompts and active versions",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "flow"
    ]
  },
  {
    "id": "flow.create",
    "title": "Propose a new repository flow",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "flow.new"
    ]
  },
  {
    "id": "flow.edit",
    "title": "Propose an overridable flow edit as a TODO",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "flow.edit"
    ]
  },
  {
    "id": "flow.source",
    "title": "Read and co-edit flow source on its TODO branch",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "flow.source",
      "flow.source-coedit"
    ]
  },
  {
    "id": "flow.plan",
    "title": "Preview a typed flow plan",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "flow.plan"
    ],
    "issues": [
      4253
    ]
  },
  {
    "id": "flow.run",
    "title": "Run a flow with typed inputs",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "flow.run"
    ]
  },
  {
    "id": "flow.activate",
    "title": "Activate merged flows after successful loading",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "flows.read"
    ]
  },
  {
    "id": "flow.pin",
    "title": "Keep running work and retries on their pinned version",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "run"
    ]
  },
  {
    "id": "flow.system.boundary",
    "title": "Refuse overrides of system stack and trust flows",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "flow.edit"
    ]
  },
  {
    "id": "run.list",
    "title": "List runs and Needs you",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "runs"
    ]
  },
  {
    "id": "run.open",
    "title": "Read a run and its output",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "run"
    ]
  },
  {
    "id": "run.inspect",
    "title": "Inspect graph steps transcripts retries waits journal and usage",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "monitor",
      "run.inspect"
    ],
    "issues": [
      4032
    ]
  },
  {
    "id": "run.stop",
    "title": "Stop a running flow",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "runs.cancel"
    ]
  },
  {
    "id": "run.retry",
    "title": "Retry a failed run",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "runs.rerun"
    ]
  },
  {
    "id": "run.resume",
    "title": "Resume a durable wait",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "runs.resume",
      "runs.continue"
    ]
  },
  {
    "id": "run.approve",
    "title": "Answer a human approval",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "approval.approve"
    ]
  },
  {
    "id": "run.deny",
    "title": "Deny a human approval",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "approval.deny"
    ]
  },
  {
    "id": "run.background.retry",
    "title": "Retry failed background work",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "background.retry"
    ]
  },
  {
    "id": "run.background.dismiss",
    "title": "Dismiss failed background work while retaining its record",
    "spec": [
      "§6.12",
      "J5",
      "J11"
    ],
    "operations": [
      "background.dismiss"
    ]
  },
  {
    "id": "flow.custom.view",
    "title": "Render a flow’s declared output in cards home and monitor",
    "spec": [
      "§6.17",
      "M-47"
    ],
    "operations": [
      "flow",
      "run.inspect"
    ]
  },
  {
    "id": "flow.notification.policy",
    "title": "Route notifications through repository policy with access checks",
    "spec": [
      "§6.17",
      "M-47"
    ],
    "operations": [
      "flow.edit",
      "flow.run"
    ],
    "issues": [
      4026
    ]
  },
  {
    "id": "trigger.deferred",
    "title": "Keep deferred trigger registration unavailable to ordinary members",
    "spec": [
      "§6.14",
      "J11"
    ],
    "operations": [
      "triggers.list",
      "triggers.register"
    ]
  },
  {
    "id": "flow.author.verify",
    "title": "Validate generated flow source before proposing its TODO",
    "spec": [
      "C.5",
      "J5"
    ],
    "operations": [
      "flow.new"
    ]
  }
]
