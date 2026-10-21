import { digestSync } from "@smthrs/crypto"
import { SANDBOX_USER } from "../../src/features/terminal/contract.ts"

// Each person's own user in a branch's machine (decision 0013 §3, mvp.md §6.8): every terminal runs as its owner, so
// one person's shell can't attach to, type into or signal another's. A user's tmux server listens on a socket only
// that user can open; the branch's checkout is shared through the `workspace` group (infra/sandbox/Dockerfile).
//
// The machine knows a user by name; the container runs a command as a numeric `uid:gid` (`idOf`): a deployed
// container's `exec` refuses a name, and runs a bare uid as root. A person's uid comes from their name, so it is the same
// on every machine and needs no lookup. Under the `durable_object` scheduling policy every process keeps root's
// capabilities whatever its user (Cloudflare's container docs), so these users give files and shells their owner; they
// don't isolate one editor from another.

/** The group every person's user is in, which owns /workspace. */
export const WORKSPACE_GROUP = "workspace"

/** The workspace group's id, as infra/sandbox/Dockerfile makes it. */
export const WORKSPACE_GID = 2000

/** The checkout user's uid, as infra/sandbox/Dockerfile makes it. */
export const SANDBOX_UID = 1000

/** The first uid a person's user gets; their uids span the next 2^24. */
export const PERSON_UID_BASE = 100_000

/** A person's user name in the machine: `p` and 16 hex digits of the SHA-256 of their person id. */
export const userOf = (ownerId: string): string => `p${digestSync(ownerId).slice(0, 16)}`

const personName = /^p[0-9a-f]{16}$/

/** The uid of a person's user `name`: `PERSON_UID_BASE` plus its first 24 bits. */
export const uidOf = (name: string): number => PERSON_UID_BASE + Number.parseInt(name.slice(1, 7), 16)

/**
 * The `uid:gid` a command runs as for the machine's user `name`: root, the checkout's user, or a person's; nothing for
 * any other name.
 */
export const idOf = (name: string): string | undefined =>
  name === "root"
    ? "0:0"
    : name === SANDBOX_USER
    ? `${SANDBOX_UID}:${WORKSPACE_GID}`
    : personName.test(name)
    ? `${uidOf(name)}:${WORKSPACE_GID}`
    : undefined

/** What a command needs from its user that `exec` doesn't give it: only `PATH` comes from the image. */
export const envOf = (name: string): Record<string, string> => ({
  HOME: name === "root" ? "/root" : `/home/${name}`,
  USER: name,
  LOGNAME: name,
  LANG: "C.UTF-8",
})

const script = [
  // The name's user is there with its uid; one with another uid is refused, never reused.
  `if uid=$(id -u "$1" 2>/dev/null); then [ "$uid" = "$2" ]; exit; fi`,
  // A provision racing this one may make it first.
  `useradd --create-home --no-log-init --shell /bin/bash --uid "$2" --gid ${WORKSPACE_GROUP} "$1" || [ "$(id -u "$1" 2>/dev/null)" = "$2" ]`,
].join("\n")

/**
 * The command, run as root, that makes person's user `user` with its uid (`uidOf`) unless it is there. The name and the
 * uid travel as arguments.
 */
export const provisionArgv = (user: string): Array<string> => ["sh", "-c", script, "provision", user, String(uidOf(user))]
