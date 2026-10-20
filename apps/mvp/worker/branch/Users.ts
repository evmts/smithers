import { digestSync } from "@smthrs/crypto"

// Each person's own user in a branch's machine (decision 0013 §3, mvp.md §6.8): every terminal runs as its owner, so
// one person's shell can't attach to, type into or signal another's. A user's tmux server listens on a socket only
// that user can open; the branch's checkout is shared through the `workspace` group (infra/sandbox/Dockerfile).

/** The group every person's user is in, which owns /workspace. */
export const WORKSPACE_GROUP = "workspace"

/** A person's user name in the machine: `p` and 16 hex digits of the SHA-256 of their person id. */
export const userOf = (ownerId: string): string => `p${digestSync(ownerId).slice(0, 16)}`

const script = [
  "set -e",
  `id -u "$1" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash --gid ${WORKSPACE_GROUP} "$1"`,
].join("\n")

/** The command, run as root, that makes user `user` unless it is there. The name travels as an argument. */
export const provisionArgv = (user: string): Array<string> => ["sh", "-c", script, "provision", user]
