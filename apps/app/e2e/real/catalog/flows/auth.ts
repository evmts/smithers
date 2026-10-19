import type { FlowEntry } from "../types"

/** Product obligations, not implementation or passing-test claims. */
export const flows: readonly FlowEntry[] = [
  {
    "id": "auth.session",
    "title": "Read signed-in identity",
    "spec": [
      "§6.2",
      "J1",
      "M-44"
    ],
    "operations": [
      "self.read",
      "account.show"
    ],
    "issues": [
      4265
    ]
  },
  {
    "id": "auth.sign.in",
    "title": "Sign in with GitHub",
    "spec": [
      "§6.2",
      "J1",
      "M-44"
    ],
    "operations": [
      "sign-in",
      "auth.prompt"
    ]
  },
  {
    "id": "auth.sign.out",
    "title": "Sign out and revoke the session",
    "spec": [
      "§6.2",
      "J1",
      "M-44"
    ],
    "operations": [
      "sign-out"
    ]
  },
  {
    "id": "auth.email",
    "title": "Request email sign-in",
    "spec": [
      "§6.2",
      "J1",
      "M-44"
    ],
    "operations": [
      "auth.email"
    ]
  },
  {
    "id": "auth.permissions",
    "title": "Enforce person and delegated-agent permissions",
    "spec": [
      "§6.2",
      "J1",
      "M-44"
    ],
    "operations": [
      "confirmations.read"
    ]
  }
]
