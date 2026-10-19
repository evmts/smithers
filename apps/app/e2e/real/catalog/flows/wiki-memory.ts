import type { FlowEntry } from "../types"

/** Product obligations, not implementation or passing-test claims. */
export const flows: readonly FlowEntry[] = [
  {
    "id": "wiki.open",
    "title": "Read pages outline backlinks and graph",
    "spec": [
      "§6.11",
      "J8",
      "J9"
    ],
    "operations": [
      "wiki",
      "wiki.page",
      "wiki.backlinks",
      "wiki.graph"
    ]
  },
  {
    "id": "wiki.create",
    "title": "Create a wiki page",
    "spec": [
      "§6.11",
      "J8",
      "J9"
    ],
    "operations": [
      "wiki.cloud.new"
    ]
  },
  {
    "id": "wiki.edit",
    "title": "Live co-edit a wiki page",
    "spec": [
      "§6.11",
      "J8",
      "J9"
    ],
    "operations": [
      "wiki.edit"
    ]
  },
  {
    "id": "wiki.rename",
    "title": "Rename a wiki page",
    "spec": [
      "§6.11",
      "J8",
      "J9"
    ],
    "operations": [
      "wiki.cloud.rename"
    ]
  },
  {
    "id": "wiki.delete",
    "title": "Confirm deletion of a wiki page",
    "spec": [
      "§6.11",
      "J8",
      "J9"
    ],
    "operations": [
      "wiki.delete",
      "wiki.delete.confirm"
    ]
  },
  {
    "id": "wiki.history",
    "title": "Read attributed page revisions",
    "spec": [
      "§6.11",
      "J8",
      "J9"
    ],
    "operations": [
      "wiki.history"
    ]
  },
  {
    "id": "wiki.sync",
    "title": "Sync the vault with a local Obsidian folder",
    "spec": [
      "§6.11",
      "J8",
      "J9"
    ],
    "operations": [
      "wiki.sync"
    ]
  },
  {
    "id": "wiki.attach",
    "title": "Attach a wiki document",
    "spec": [
      "§6.11",
      "J8",
      "J9"
    ],
    "operations": [
      "wiki.attach"
    ]
  },
  {
    "id": "wiki.refresh",
    "title": "Refresh generated pages after merges",
    "spec": [
      "§6.11",
      "J8",
      "J9"
    ],
    "operations": [
      "wiki.create"
    ]
  },
  {
    "id": "memory.recall",
    "title": "Use one vault and cite exact page revisions",
    "spec": [
      "§6.11",
      "J8",
      "J9"
    ],
    "operations": [
      "wiki.read"
    ]
  },
  {
    "id": "memory.learning",
    "title": "Write source-linked decisions after merge",
    "spec": [
      "§6.11",
      "J8",
      "J9"
    ],
    "operations": [
      "wiki.read"
    ]
  },
  {
    "id": "memory.improvement",
    "title": "Accept or dismiss an evidence-backed flow improvement",
    "spec": [
      "§6.11",
      "J8",
      "J9"
    ],
    "operations": [
      "learning.accept",
      "learning.dismiss"
    ]
  },
  {
    "id": "memory.preflight",
    "title": "Choose wiki code history and facts before planning",
    "spec": [
      "C.4",
      "J8"
    ],
    "operations": []
  },
  {
    "id": "memory.remember",
    "title": "Record a learned fact with provenance",
    "spec": [
      "C.4",
      "J8"
    ],
    "operations": []
  }
]
