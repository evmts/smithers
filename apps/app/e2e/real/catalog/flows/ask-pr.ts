import type { FlowEntry } from "../types"

/** Product obligations, not implementation or passing-test claims. */
export const flows: readonly FlowEntry[] = [
  {
    "id": "ask.answer",
    "title": "Ask about repository code and receive cards",
    "spec": [
      "§6.5",
      "J9"
    ],
    "operations": [
      "chat.send"
    ],
    "issues": [
      3812,
      4251
    ]
  },
  {
    "id": "ask.context",
    "title": "Inspect the answer’s selected context",
    "spec": [
      "§6.5",
      "J9"
    ],
    "operations": [
      "run.inspect"
    ]
  },
  {
    "id": "ask.make.todo",
    "title": "Turn an answer into a TODO",
    "spec": [
      "§6.5",
      "J9"
    ],
    "operations": [
      "todo.new"
    ]
  },
  {
    "id": "ask.save.wiki",
    "title": "Save an answer to the wiki",
    "spec": [
      "§6.5",
      "J9"
    ],
    "operations": [
      "wiki.save"
    ]
  },
  {
    "id": "ask.change",
    "title": "Ask for a hosted code change",
    "spec": [
      "§6.5",
      "J9"
    ],
    "operations": [
      "change.ask"
    ]
  },
  {
    "id": "ask.open.pull",
    "title": "Open the change’s pull request",
    "spec": [
      "§6.5",
      "J9"
    ],
    "operations": [
      "change.open-pull"
    ]
  },
  {
    "id": "workspace.open",
    "title": "Open the shared branch workspace",
    "spec": [
      "§6.7",
      "J3",
      "J7"
    ],
    "operations": [
      "branch",
      "branch.read"
    ]
  },
  {
    "id": "workspace.files",
    "title": "Read files without waking a sleeping machine",
    "spec": [
      "§6.7",
      "J3",
      "J7"
    ],
    "operations": [
      "files",
      "file"
    ],
    "issues": [
      4313
    ]
  },
  {
    "id": "workspace.diff",
    "title": "Read a branch diff",
    "spec": [
      "§6.7",
      "J3",
      "J7"
    ],
    "operations": [
      "diff"
    ]
  },
  {
    "id": "workspace.code.intelligence",
    "title": "Read definitions hover and diagnostics",
    "spec": [
      "§6.7",
      "J3",
      "J7"
    ],
    "operations": [
      "code.hover",
      "code.definition",
      "code.diagnostics"
    ]
  },
  {
    "id": "workspace.sleep",
    "title": "Sleep an idle branch with its disk retained",
    "spec": [
      "§6.7",
      "J3",
      "J7"
    ],
    "operations": [
      "branch.sleep"
    ]
  },
  {
    "id": "workspace.wake",
    "title": "Wake a branch under people-first admission",
    "spec": [
      "§6.7",
      "J3",
      "J7"
    ],
    "operations": [
      "branch.wake"
    ],
    "issues": [
      4294
    ]
  },
  {
    "id": "workspace.capacity",
    "title": "Observe machine capacity and queue position",
    "spec": [
      "§6.7",
      "J3",
      "J7"
    ],
    "operations": [
      "install.read"
    ]
  },
  {
    "id": "workspace.cleanup",
    "title": "Capture work before machine cleanup",
    "spec": [
      "§6.7",
      "J3",
      "J7"
    ],
    "operations": [
      "box.delete"
    ]
  },
  {
    "id": "workspace.archive",
    "title": "Archive a scratch branch",
    "spec": [
      "§6.7",
      "J3",
      "J7"
    ],
    "operations": [
      "branch.archive"
    ]
  },
  {
    "id": "ui.theme",
    "title": "Choose the light or dark Paper palette",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [
      "theme"
    ],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    }
  },
  {
    "id": "ui.input.mode",
    "title": "Choose Normal or Vim input",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    }
  },
  {
    "id": "ui.chat.controls",
    "title": "Stop retry open reload and copy chat",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [
      "stop",
      "chat.retry",
      "chat.open",
      "chat.reload",
      "chat.copy-message"
    ],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    }
  },
  {
    "id": "ui.prompt.queue",
    "title": "Queue edit remove and restore follow-ups",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [
      "chat.queue",
      "chat.queue.edit",
      "chat.queue.remove",
      "chat.queue.restore"
    ],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    }
  },
  {
    "id": "ui.conversation.filter",
    "title": "Filter and search the conversation",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    }
  },
  {
    "id": "ui.card.controls",
    "title": "Maximize minimize dismiss and navigate cards",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [
      "card.maximize",
      "card.minimize",
      "card.dismiss",
      "card.history.back",
      "card.history.forward"
    ],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    }
  },
  {
    "id": "ui.frame.navigation",
    "title": "Navigate backward and forward",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [
      "frame.back",
      "frame.forward"
    ],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    }
  },
  {
    "id": "ui.palette",
    "title": "Open commands and recent items",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [
      "palette.open",
      "palette.actions",
      "palette.recent",
      "help"
    ],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    }
  },
  {
    "id": "ui.search",
    "title": "Search files flows issues runs wiki and changes",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [
      "search",
      "search.files",
      "search.flows",
      "search.issues",
      "search.runs",
      "search.wiki",
      "search.changes",
      "search.history"
    ],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    }
  },
  {
    "id": "ui.notifications",
    "title": "Allow or dismiss browser notifications and toasts",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [
      "notifications.allow",
      "toast.dismiss"
    ],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    },
    "issues": [
      4034
    ]
  },
  {
    "id": "ui.hint",
    "title": "Dismiss the first-sight hint",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [
      "app.hint.dismiss"
    ],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    }
  },
  {
    "id": "ui.storage.recovery",
    "title": "Recover export or reset private local state",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [
      "storage.recovery",
      "storage.recovery.export",
      "storage.recovery.reset"
    ],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    }
  },
  {
    "id": "ui.monitor.controls",
    "title": "Select monitor graph timeline and trace views",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [
      "runs.graph.select",
      "runs.trace.select",
      "runs.trace.filter",
      "runs.trace.view"
    ],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    }
  },
  {
    "id": "ui.card.tabs",
    "title": "Change PR branch and change facets",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [
      "prs.tab",
      "box.facet",
      "change.facet"
    ],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    },
    "issues": [
      4035
    ]
  },
  {
    "id": "ui.timeline",
    "title": "Navigate shared summarized transcript entries",
    "spec": [
      "Appendix B.1",
      "M-48"
    ],
    "operations": [
      "history"
    ],
    "na": {
      "api": "Appendix B.1: browser-only personal screen control.",
      "cli": "Appendix B.1: browser-only personal screen control.",
      "tui": "Appendix B.1: browser-only personal screen control."
    },
    "issues": [
      4033
    ]
  }
]
