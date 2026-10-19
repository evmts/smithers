import type { FlowEntry } from "../types"

/** Product obligations, not implementation or passing-test claims. */
export const flows: readonly FlowEntry[] = [
  {
    "id": "branch.list",
    "title": "Navigate branches parent and children",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "branches"
    ]
  },
  {
    "id": "branch.presence",
    "title": "See people and agents with their current activity",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "live"
    ]
  },
  {
    "id": "branch.fork",
    "title": "Fork main an item or another branch",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "branch.fork"
    ]
  },
  {
    "id": "branch.add.to.stack",
    "title": "Turn the complete scratch change into a TODO",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "branch.add-to-stack"
    ]
  },
  {
    "id": "branch.rebase",
    "title": "Rebase now or defer while people are present",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "branch.rebase",
      "branch.rebase-now"
    ]
  },
  {
    "id": "branch.activity",
    "title": "Share conversations agent activity and attributed edits",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "branch.read"
    ]
  },
  {
    "id": "file.coedit",
    "title": "Co-edit with live cursors and continuous saves",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "file"
    ]
  },
  {
    "id": "file.stale.write",
    "title": "Refuse writes based on a stale file version",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "file"
    ]
  },
  {
    "id": "file.external.change",
    "title": "Update open files from attributed external change bursts",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "file"
    ]
  },
  {
    "id": "file.compare",
    "title": "Compare an external version with the live document",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "file.compare"
    ]
  },
  {
    "id": "file.restore",
    "title": "Restore one file as a new attributed edit",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "file.restore"
    ]
  },
  {
    "id": "file.deleted",
    "title": "Restore a deleted file",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "file.restore-deleted"
    ]
  },
  {
    "id": "file.renamed",
    "title": "Follow a renamed file",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "file.follow-rename"
    ]
  },
  {
    "id": "file.reapply",
    "title": "Recover unsaved edits after document recovery",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "file.reapply"
    ]
  },
  {
    "id": "branch.return.to.item",
    "title": "Recover after hand-run version control moves the working copy",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "todo.return-to-item",
      "todo.keep-moved"
    ]
  },
  {
    "id": "terminal.open",
    "title": "Open one’s own terminal and persist machine-local login",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "terminal"
    ]
  },
  {
    "id": "terminal.watch",
    "title": "Watch a session without typing as its owner",
    "spec": [
      "§6.8",
      "J3",
      "J6",
      "J7"
    ],
    "operations": [
      "terminal.watch"
    ]
  }
]
