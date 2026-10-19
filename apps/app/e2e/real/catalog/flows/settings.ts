import type { FlowEntry } from "../types"

/** Product obligations, not implementation or passing-test claims. */
export const flows: readonly FlowEntry[] = [
  {
    "id": "settings.open",
    "title": "Read owner install settings",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "settings"
    ]
  },
  {
    "id": "settings.models",
    "title": "Configure fast coding and Decisions model access",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "settings.model.set"
    ],
    "issues": [
      4226,
      4227,
      4228,
      4229
    ]
  },
  {
    "id": "settings.address",
    "title": "Set bind and public addresses",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "settings"
    ]
  },
  {
    "id": "settings.capacity",
    "title": "Set parallel-work capacity",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "settings"
    ]
  },
  {
    "id": "settings.github",
    "title": "Read GitHub App health and permissions",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "github"
    ],
    "issues": [
      4322
    ]
  },
  {
    "id": "secret.list",
    "title": "Read secret names with person-only access",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "secrets",
      "secrets.read"
    ],
    "issues": [
      4056
    ]
  },
  {
    "id": "secret.set",
    "title": "Add or replace a write-only secret",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "secrets.set"
    ]
  },
  {
    "id": "secret.delete",
    "title": "Delete a secret",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "secrets.delete"
    ]
  },
  {
    "id": "secret.scope",
    "title": "Scope secrets to machines or trusted main runs",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "secrets.scope"
    ]
  },
  {
    "id": "member.list",
    "title": "Read people and roles",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "members",
      "members.list"
    ]
  },
  {
    "id": "member.add",
    "title": "Add a GitHub user with repository access",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "members.add"
    ],
    "issues": [
      4075
    ]
  },
  {
    "id": "member.role",
    "title": "Change a member’s role",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "members.role"
    ]
  },
  {
    "id": "member.remove",
    "title": "Remove access and terminate sessions terminals and SSH",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "members.remove"
    ]
  },
  {
    "id": "ssh.connect",
    "title": "Connect as oneself to a branch over SSH",
    "spec": [
      "§6.15",
      "J1"
    ],
    "operations": [
      "ssh"
    ]
  }
]
