import type { FlowEntry } from "../types"

/** Product obligations, not implementation or passing-test claims. */
export const flows: readonly FlowEntry[] = [
  {
    "id": "install.mac",
    "title": "Install the Apple Silicon Mac service and bundled image",
    "spec": [
      "§6.1",
      "J1"
    ],
    "operations": [],
    "na": {
      "ui": "§6.1: package installation runs on the Apple Silicon Mac, before the service exists.",
      "api": "§6.1: package installation runs on the Apple Silicon Mac, before the service exists.",
      "tui": "§6.1: package installation runs on the Apple Silicon Mac, before the service exists."
    }
  },
  {
    "id": "install.setup",
    "title": "Complete address App owner model and squash prerequisites",
    "spec": [
      "§6.1",
      "J1"
    ],
    "operations": []
  },
  {
    "id": "install.source.ready",
    "title": "Mirror source before the first machine is ready",
    "spec": [
      "§6.1",
      "J1"
    ],
    "operations": [
      "repos.import"
    ]
  },
  {
    "id": "install.image",
    "title": "Detect toolchains and prepare undeclared repositories",
    "spec": [
      "§6.1",
      "J1"
    ],
    "operations": [
      "install.read"
    ]
  },
  {
    "id": "install.restart",
    "title": "Reconcile interrupted external actions after restart",
    "spec": [
      "§6.1",
      "J1"
    ],
    "operations": [
      "run"
    ],
    "issues": [
      4082
    ]
  },
  {
    "id": "install.image.package",
    "title": "Propose a machine-image package as a TODO",
    "spec": [
      "§6.1",
      "J1"
    ],
    "operations": [
      "image.add"
    ]
  }
]
