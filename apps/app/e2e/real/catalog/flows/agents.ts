import type { FlowEntry } from "../types"

/** Product obligations, not implementation or passing-test claims. */
export const flows: readonly FlowEntry[] = [
  {
    "id": "agent.external",
    "title": "Run a personally signed-in coding harness on the branch",
    "spec": [
      "§6.13",
      "J6"
    ],
    "operations": [
      "terminal"
    ]
  },
  {
    "id": "agent.skill",
    "title": "Use the shared Smithers skill as an attributed delegated agent",
    "spec": [
      "§6.13",
      "J6"
    ],
    "operations": [
      "help"
    ]
  },
  {
    "id": "agent.delegation",
    "title": "Require human confirmation and refuse agent approvals and merge",
    "spec": [
      "§6.13",
      "J6"
    ],
    "operations": [
      "confirmations.read"
    ]
  },
  {
    "id": "agent.coding",
    "title": "Plan implement check review and propose a TODO on its machine",
    "spec": [
      "§6.9",
      "J2"
    ],
    "operations": [
      "agent.turn"
    ],
    "issues": [
      4074
    ]
  },
  {
    "id": "agent.coding.shell",
    "title": "Run coding-agent commands in a watchable terminal",
    "spec": [
      "§6.9",
      "J2"
    ],
    "operations": [
      "terminal"
    ]
  },
  {
    "id": "agent.coding.question",
    "title": "Ask a person durably during implementation",
    "spec": [
      "§6.9",
      "J2"
    ],
    "operations": [
      "todo.answer"
    ]
  },
  {
    "id": "agent.list",
    "title": "List factory agents",
    "spec": [
      "§6.14",
      "J11"
    ],
    "operations": [
      "agents"
    ]
  },
  {
    "id": "agent.open",
    "title": "Read instructions tools permissions models and runs",
    "spec": [
      "§6.14",
      "J11"
    ],
    "operations": [
      "agent"
    ]
  },
  {
    "id": "agent.instructions",
    "title": "Propose instruction and tool changes as a TODO",
    "spec": [
      "§6.14",
      "J11"
    ],
    "operations": [
      "agent.edit"
    ]
  },
  {
    "id": "agent.model",
    "title": "Set an agent model as the owner",
    "spec": [
      "§6.14",
      "J11"
    ],
    "operations": [
      "model.assign"
    ]
  },
  {
    "id": "agent.app",
    "title": "Drive shared flows with forms for missing inputs",
    "spec": [
      "§6.5",
      "J9"
    ],
    "operations": [
      "chat.send",
      "form.set",
      "form.submit"
    ]
  },
  {
    "id": "agent.plan",
    "title": "Plan the change with versioned wiki context",
    "spec": [
      "C.1",
      "J2"
    ],
    "operations": []
  },
  {
    "id": "agent.implement",
    "title": "Implement planned atoms with versioned writes",
    "spec": [
      "C.1",
      "J2"
    ],
    "operations": []
  },
  {
    "id": "agent.check",
    "title": "Run detected toolchain checks on the branch",
    "spec": [
      "C.1",
      "J2"
    ],
    "operations": []
  },
  {
    "id": "agent.correct",
    "title": "Repair review findings and recheck",
    "spec": [
      "C.1",
      "J2"
    ],
    "operations": []
  },
  {
    "id": "agent.decide",
    "title": "Inspect typed decisions and their evidence",
    "spec": [
      "C.1",
      "J2"
    ],
    "operations": [
      "run.inspect"
    ]
  },
  {
    "id": "agent.tools.read",
    "title": "Read and search the working copy",
    "spec": [
      "C.7",
      "J2"
    ],
    "operations": []
  },
  {
    "id": "agent.tools.write",
    "title": "Apply versioned writes and patches",
    "spec": [
      "C.7",
      "J2"
    ],
    "operations": []
  },
  {
    "id": "agent.tools.wait",
    "title": "Recover a durable coding-agent wait",
    "spec": [
      "C.7",
      "J2"
    ],
    "operations": [
      "run.inspect"
    ]
  }
]
