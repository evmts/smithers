import type { ConfirmationUnavailable } from "../../cards/ApprovalCard"
import type { CodeIntelUnavailable } from "../seams/CodeIntelSeam"
import { refusalCopy, type RefusalDoor } from "@smthrs/rpc/RefusalCopy"
import {
  presentUserFailure,
  type UserFailure,
  type UserFailureAction,
  type UserFailureCopy,
  type UserFailureRegistry
} from "@smthrs/rpc/UserFailure"
import type { ApplicationClientError } from "../../runtime/ApplicationClient"
import type { BranchNavigationFailure, BranchNavigationReason } from "../seams/BranchNavigationSeam"
import type { RepositorySignInRequired } from "../seams/SeamContext"
import type { SharedConversationFailure } from "../seams/SharedConversationSeam"
import type { PromptRefusal } from "./sharedPrompts"
import { STATE_FAILURE_COPY, type StateTaggedFailure } from "../StateFailureCopy"
import type { SweepRequestTooLargeError } from "./ConversationSweep"

/** Every tagged failure a controller act can throw at a person. */
export type AppTaggedFailure =
  | ConfirmationUnavailable
  | CodeIntelUnavailable
  | StateTaggedFailure
  | ApplicationClientError
  | RepositorySignInRequired
  | SweepRequestTooLargeError
  | SharedConversationFailure
  | PromptRefusal
  | BranchNavigationFailure

const REFUSAL_ACTIONS: ReadonlySet<string> = new Set<UserFailureAction>(["retry", "sign-in"])

/*
 * Listing branches has its own words per reason, because it had none: a host
 * that serves no branch list answered 404, the seam threw its typed
 * BranchNavigationFailure, nothing here claimed the tag, and the person was
 * told "Branches didn't finish — the app hit an unexpected error" for a route
 * that was never there (#4028). A missing route is not a bug of the app's
 * own, and a repository nobody chose is the reader's own next step.
 */
const BRANCH_NAVIGATION_COPY: Record<BranchNavigationReason, UserFailureCopy> = {
  "repeated-branch": { fault: "infra", sentence: "Branches couldn't be listed: this host named one branch twice.", actions: ["retry"] },
  "cyclic-tree": { fault: "infra", sentence: "Branches couldn't be listed: this host's fork lineage loops back on itself.", actions: ["retry"] },
  "route-absent": { fault: "infra", sentence: "This host doesn't serve a branch list.", actions: [] },
  "host-refused": { fault: "infra", sentence: "Branches couldn't be listed — the host refused the read.", actions: ["retry"] },
  "no-repository": { fault: "user", sentence: "Choose a repository to see its branches.", actions: [] }
}

/*
 * An API refusal already has written copy per fault and code (RefusalCopy).
 * Its lead is the sentence; the server's own words stay in Details.
 */
const clientRefusalCopy = (failure: ApplicationClientError): UserFailureCopy => {
  const copy = refusalCopy(failure.refusal)
  const signIn = failure.code === "auth-missing" || failure.code === "unauthenticated"
  return {
    fault: failure.refusal.fault,
    sentence: signIn ? "Sign in to continue." : copy.lead,
    actions: signIn ? ["sign-in"] : copy.doors.filter((door): door is RefusalDoor & UserFailureAction => REFUSAL_ACTIONS.has(door))
  }
}

export const APP_FAILURE_COPY: UserFailureRegistry<AppTaggedFailure> = {
  ...STATE_FAILURE_COPY,
  ConfirmationUnavailable: { fault: "infra", sentence: "Confirmation is not available in this session.", actions: [] },
  CodeIntelUnavailable: { fault: "infra", sentence: "This host cannot run code intelligence yet.", actions: [] },
  ApplicationClientError: clientRefusalCopy,
  RepositorySignInRequired: { fault: "user", sentence: "Sign in to continue.", actions: ["sign-in"] },
  SharedConversationFailure: failure => ({ fault: "infra", sentence: failure.sentence, actions: ["retry"] }),
  PromptRefusal: { fault: "infra", sentence: "Prompt unavailable", actions: ["retry"] },
  BranchNavigationFailure: failure => BRANCH_NAVIGATION_COPY[failure.reason],
  SweepRequestTooLargeError: {
    fault: "user",
    sentence: "This conversation is too large to summarize. Nothing was cleared.",
    actions: []
  }
}

/**
 * A controller failure as a person sees it. An untagged error gets `unknown`
 * (the generic bug sentence by default) and goes to `report`; its message is
 * never the sentence.
 */
export const presentAppFailure = (
  error: unknown,
  report: (error: unknown) => void,
  unknown?: UserFailureCopy
): UserFailure =>
  presentUserFailure(APP_FAILURE_COPY, error, { onUnknown: report, ...(unknown === undefined ? {} : { unknown }) })
