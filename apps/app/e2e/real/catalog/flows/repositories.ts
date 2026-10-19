import type { FlowEntry } from "../types"

/** Product obligations, not implementation or passing-test claims. */
export const flows: readonly FlowEntry[] = [
  {
    "id": "repo.launcher",
    "title": "Open the launcher",
    "spec": [
      "§6.16",
      "M-45",
      "M-46",
      "J10"
    ],
    "operations": [
      "repo.choose"
    ]
  },
  {
    "id": "repo.open",
    "title": "Open a repository file tree and data",
    "spec": [
      "§6.16",
      "M-45",
      "M-46",
      "J10"
    ],
    "operations": [
      "repo.read",
      "repo.overview",
      "files"
    ]
  },
  {
    "id": "repo.create",
    "title": "Create a GitHub repository",
    "spec": [
      "§6.16",
      "M-45",
      "M-46",
      "J10"
    ],
    "operations": [
      "repos.create"
    ]
  },
  {
    "id": "repo.explore",
    "title": "Explore public repositories",
    "spec": [
      "§6.16",
      "M-45",
      "M-46",
      "J10"
    ],
    "operations": [
      "repos.explore"
    ]
  },
  {
    "id": "repo.import",
    "title": "Import an accessible repository",
    "spec": [
      "§6.16",
      "M-45",
      "M-46",
      "J10"
    ],
    "operations": [
      "repos.import"
    ],
    "issues": [
      4024,
      3830
    ]
  },
  {
    "id": "repo.import.retry",
    "title": "Retry failed import",
    "spec": [
      "§6.16",
      "M-45",
      "M-46",
      "J10"
    ],
    "operations": [
      "repos.import.retry"
    ]
  },
  {
    "id": "repo.app.install",
    "title": "Install the GitHub App for a repository",
    "spec": [
      "§6.16",
      "M-45",
      "M-46",
      "J10"
    ],
    "operations": [
      "github",
      "github.import-read"
    ],
    "issues": [
      4024
    ]
  },
  {
    "id": "repo.subject.route",
    "title": "Open GitHub-shaped file issue and pull request URLs",
    "spec": [
      "§6.16",
      "M-45",
      "M-46",
      "J10"
    ],
    "operations": [
      "file",
      "issue",
      "pr"
    ]
  },
  {
    "id": "repo.custom.home",
    "title": "Open a repository-defined home view",
    "spec": [
      "§6.16",
      "M-45",
      "M-46",
      "J10"
    ],
    "operations": [
      "repo.overview"
    ],
    "issues": [
      4085
    ]
  },
  {
    "id": "repo.news",
    "title": "Read Smithers update news",
    "spec": [
      "§6.16",
      "M-45",
      "M-46",
      "J10"
    ],
    "operations": [
      "app.updates"
    ],
    "issues": [
      4023
    ]
  },
  {
    "id": "repo.sync",
    "title": "Read mirror freshness and retry synchronization",
    "spec": [
      "§6.3",
      "J10"
    ],
    "operations": [
      "sync.read",
      "sync.retry"
    ]
  },
  {
    "id": "repo.main.update",
    "title": "Follow GitHub main and rebase the stack",
    "spec": [
      "§6.3",
      "J10"
    ],
    "operations": [
      "mirror.read"
    ]
  },
  {
    "id": "repo.main.reset",
    "title": "Confirm recovery after GitHub rewrites main",
    "spec": [
      "§6.3",
      "J10"
    ],
    "operations": [
      "main.reset-to-github"
    ]
  }
]
