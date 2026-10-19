import type { FlowEntry } from "../types"

/** Product obligations, not implementation or passing-test claims. */
export const flows: readonly FlowEntry[] = [
  {
    "id": "cli.login",
    "title": "Sign in from a laptop",
    "spec": [
      "Appendix B.6",
      "J6"
    ],
    "operations": [],
    "na": {
      "ui": "Appendix B.6: command executed on the person’s laptop or install host."
    }
  },
  {
    "id": "cli.ssh.key",
    "title": "Manage the person’s SSH keys",
    "spec": [
      "Appendix B.6",
      "J6"
    ],
    "operations": [],
    "na": {
      "ui": "Appendix B.6: command executed on the person’s laptop or install host."
    }
  },
  {
    "id": "cli.workspace.ssh",
    "title": "Connect to a workspace from the terminal",
    "spec": [
      "Appendix B.6",
      "J6"
    ],
    "operations": [],
    "na": {
      "ui": "Appendix B.6: command executed on the person’s laptop or install host."
    }
  },
  {
    "id": "cli.shell",
    "title": "Open a workspace shell",
    "spec": [
      "Appendix B.6",
      "J6"
    ],
    "operations": [],
    "na": {
      "ui": "Appendix B.6: command executed on the person’s laptop or install host."
    }
  },
  {
    "id": "cli.exec",
    "title": "Execute on the person’s machine",
    "spec": [
      "Appendix B.6",
      "J6"
    ],
    "operations": [],
    "na": {
      "ui": "Appendix B.6: command executed on the person’s laptop or install host."
    }
  },
  {
    "id": "cli.copy",
    "title": "Copy files to and from a workspace",
    "spec": [
      "Appendix B.6",
      "J6"
    ],
    "operations": [],
    "na": {
      "ui": "Appendix B.6: command executed on the person’s laptop or install host."
    }
  },
  {
    "id": "cli.api",
    "title": "Call the public API with the same actor permissions",
    "spec": [
      "Appendix B.6",
      "J6"
    ],
    "operations": [],
    "na": {
      "ui": "Appendix B.6: command executed on the person’s laptop or install host."
    }
  },
  {
    "id": "cli.host.start",
    "title": "Start the Mac install",
    "spec": [
      "Appendix B.6",
      "J6"
    ],
    "operations": [],
    "na": {
      "ui": "Appendix B.6: command executed on the person’s laptop or install host.",
      "api": "Appendix B.6: host lifecycle commands run by the owner on the install’s Mac.",
      "tui": "Appendix B.6: host lifecycle commands run by the owner on the install’s Mac."
    }
  },
  {
    "id": "cli.host.stop",
    "title": "Stop the Mac install",
    "spec": [
      "Appendix B.6",
      "J6"
    ],
    "operations": [],
    "na": {
      "ui": "Appendix B.6: command executed on the person’s laptop or install host.",
      "api": "Appendix B.6: host lifecycle commands run by the owner on the install’s Mac.",
      "tui": "Appendix B.6: host lifecycle commands run by the owner on the install’s Mac."
    }
  },
  {
    "id": "cli.host.status",
    "title": "Read host service status",
    "spec": [
      "Appendix B.6",
      "J6"
    ],
    "operations": [],
    "na": {
      "ui": "Appendix B.6: command executed on the person’s laptop or install host.",
      "api": "Appendix B.6: host lifecycle commands run by the owner on the install’s Mac.",
      "tui": "Appendix B.6: host lifecycle commands run by the owner on the install’s Mac."
    }
  },
  {
    "id": "cli.host.upgrade",
    "title": "Upgrade the Mac install",
    "spec": [
      "Appendix B.6",
      "J6"
    ],
    "operations": [],
    "na": {
      "ui": "Appendix B.6: command executed on the person’s laptop or install host.",
      "api": "Appendix B.6: host lifecycle commands run by the owner on the install’s Mac.",
      "tui": "Appendix B.6: host lifecycle commands run by the owner on the install’s Mac."
    }
  },
  {
    "id": "cli.host.backup",
    "title": "Back up the install",
    "spec": [
      "Appendix B.6",
      "J6"
    ],
    "operations": [],
    "na": {
      "ui": "Appendix B.6: command executed on the person’s laptop or install host.",
      "api": "Appendix B.6: host lifecycle commands run by the owner on the install’s Mac.",
      "tui": "Appendix B.6: host lifecycle commands run by the owner on the install’s Mac."
    }
  },
  {
    "id": "cli.host.restore",
    "title": "Restore the install",
    "spec": [
      "Appendix B.6",
      "J6"
    ],
    "operations": [],
    "na": {
      "ui": "Appendix B.6: command executed on the person’s laptop or install host.",
      "api": "Appendix B.6: host lifecycle commands run by the owner on the install’s Mac.",
      "tui": "Appendix B.6: host lifecycle commands run by the owner on the install’s Mac."
    }
  }
]
