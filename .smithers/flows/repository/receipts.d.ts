/** Proof comes from this host's existing approved control and engine ancestry. */
import { ControlRuntime } from "@smthrs/control/ControlRuntime";
import { DurableEngineState } from "@smthrs/engine-store";
import * as RunCatalogRead from "@smthrs/engine-store/RunCatalogRead";
import * as RunStore from "@smthrs/run-store/RunStore";
import { Effect, Schema } from "effect";
import { CodingError } from "../coding/schema.ts";
import { JobInput, SetupInput } from "./schema.ts";
/** The one definition of an owned native result: the bounded store read, the
 * ancestry walk, and every identity binding between the proven execution, its
 * registered bridge dispatch and its approved control root. Callers vary only
 * in which ancestor statuses they accept and whether the proven execution's own
 * payload is the dispatched input; a step still inside a running job is not. */
export declare const ownedAncestry: <S extends Schema.Top & {
    readonly DecodingServices: never;
}, E extends Schema.Top & {
    readonly DecodingServices: never;
}, P extends Schema.Top & {
    readonly EncodingServices: never;
}>(options: {
    readonly executionId: string;
    readonly flow: string;
    readonly bridge: string;
    readonly payload: unknown;
    readonly payloadSchema: P;
    readonly success: S;
    readonly error: E;
    readonly ancestors: (status: string) => boolean;
    readonly dispatched: boolean;
}) => Effect.Effect<{
    output: S["Type"];
    run: {
        readonly executionObservation?: "missing" | "observed" | undefined;
        readonly executionView?: {
            readonly root: {
                readonly executionId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly flowName: string;
                readonly status: "cancelled" | "completed" | "failed" | "pending" | "running" | "suspended";
                readonly createdAtMs: number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">;
                readonly startedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly finishedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly parentRunId: (string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">) | null;
                readonly lineageId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly roundOrdinal: number;
                readonly cancelRequestedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly treeVersion?: 1 | undefined;
                readonly parentPolicy?: "cancel" | "detach" | undefined;
                readonly waiting: {
                    readonly reason: string;
                    readonly wakeAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                    readonly tokenDigest: string | null;
                    readonly point?: string | null | undefined;
                    readonly request?: Schema.Json | undefined;
                } | null;
            };
            readonly current: {
                readonly executionId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly flowName: string;
                readonly status: "cancelled" | "completed" | "failed" | "pending" | "running" | "suspended";
                readonly createdAtMs: number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">;
                readonly startedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly finishedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly parentRunId: (string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">) | null;
                readonly lineageId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly roundOrdinal: number;
                readonly cancelRequestedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly treeVersion?: 1 | undefined;
                readonly parentPolicy?: "cancel" | "detach" | undefined;
                readonly waiting: {
                    readonly reason: string;
                    readonly wakeAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                    readonly tokenDigest: string | null;
                    readonly point?: string | null | undefined;
                    readonly request?: Schema.Json | undefined;
                } | null;
            };
            readonly humanWaits?: readonly {
                readonly executionId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly flowName: string;
                readonly status: "cancelled" | "completed" | "failed" | "pending" | "running" | "suspended";
                readonly createdAtMs: number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">;
                readonly startedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly finishedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly parentRunId: (string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">) | null;
                readonly lineageId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly roundOrdinal: number;
                readonly cancelRequestedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly treeVersion?: 1 | undefined;
                readonly parentPolicy?: "cancel" | "detach" | undefined;
                readonly waiting: {
                    readonly reason: string;
                    readonly wakeAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                    readonly tokenDigest: string | null;
                    readonly point?: string | null | undefined;
                    readonly request?: Schema.Json | undefined;
                } | null;
            }[] | undefined;
        } | undefined;
        readonly runId: string;
        readonly flowId: string;
        readonly status: "accepted" | "cancelled" | "completed" | "failed" | "parked" | "running" | "waiting-approval";
        readonly planId?: string | undefined;
        readonly planDigest?: string | undefined;
        readonly executionDigest?: string | undefined;
        readonly engineVersion?: string | undefined;
        readonly codeDrift?: {
            readonly recorded?: string | undefined;
            readonly current?: string | undefined;
            readonly recordedEngine?: string | undefined;
            readonly currentEngine?: string | undefined;
        } | undefined;
        readonly ownerId?: string | undefined;
        readonly launchedBy?: {
            readonly id: string;
            readonly kind: string;
        } | undefined;
        readonly parentRunId?: string | undefined;
        readonly lineageId?: string | undefined;
        readonly roundOrdinal?: number | undefined;
        readonly origin?: "child" | "continuation" | "fork" | undefined;
        readonly waitingReason?: string | undefined;
        readonly steering?: {
            readonly pending: number;
        } | undefined;
        readonly pendingResume?: number | undefined;
        readonly parkedBy?: string | undefined;
        readonly cancellation?: {
            readonly requestedAt: number;
            readonly source: "cascade" | "control" | "engine";
            readonly principal?: {
                readonly id: string;
                readonly kind: string;
                readonly stampedAt: number;
            } | undefined;
            readonly reason?: string | undefined;
            readonly cascadedFrom?: string | undefined;
        } | undefined;
        readonly pendingWaits?: readonly {
            readonly runId: string;
            readonly flowId?: string | undefined;
            readonly reason: string;
            readonly token: string;
            readonly tokenDigest?: string | undefined;
            readonly name?: string | undefined;
            readonly attempt?: number | undefined;
            readonly request?: Schema.Json | undefined;
            readonly createdAt: number;
        }[] | undefined;
        readonly deadlineAt?: number | undefined;
        readonly createdAt: number;
        readonly updatedAt: number;
    };
    plan: import("@smthrs/control/ControlRuntime").StoredPlan;
    input: unknown;
}, CodingError | import("@smthrs/control/ControlError").PersistenceError | import("@smthrs/control/ControlError").PlanNotFound | RunStore.RunStoreError, ControlRuntime | DurableEngineState.DurableEngineState | RunStore.RunStore>;
export declare const readOwnedResult: <S extends Schema.Top & {
    readonly DecodingServices: never;
}, E extends Schema.Top & {
    readonly DecodingServices: never;
}, P extends Schema.Top & {
    readonly EncodingServices: never;
}>(executionId: string, flow: string, bridge: string, payload: unknown, payloadSchema: P, success: S, error: E) => Effect.Effect<{
    output: S["Type"];
    run: {
        readonly executionObservation?: "missing" | "observed" | undefined;
        readonly executionView?: {
            readonly root: {
                readonly executionId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly flowName: string;
                readonly status: "cancelled" | "completed" | "failed" | "pending" | "running" | "suspended";
                readonly createdAtMs: number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">;
                readonly startedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly finishedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly parentRunId: (string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">) | null;
                readonly lineageId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly roundOrdinal: number;
                readonly cancelRequestedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly treeVersion?: 1 | undefined;
                readonly parentPolicy?: "cancel" | "detach" | undefined;
                readonly waiting: {
                    readonly reason: string;
                    readonly wakeAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                    readonly tokenDigest: string | null;
                    readonly point?: string | null | undefined;
                    readonly request?: Schema.Json | undefined;
                } | null;
            };
            readonly current: {
                readonly executionId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly flowName: string;
                readonly status: "cancelled" | "completed" | "failed" | "pending" | "running" | "suspended";
                readonly createdAtMs: number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">;
                readonly startedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly finishedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly parentRunId: (string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">) | null;
                readonly lineageId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly roundOrdinal: number;
                readonly cancelRequestedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly treeVersion?: 1 | undefined;
                readonly parentPolicy?: "cancel" | "detach" | undefined;
                readonly waiting: {
                    readonly reason: string;
                    readonly wakeAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                    readonly tokenDigest: string | null;
                    readonly point?: string | null | undefined;
                    readonly request?: Schema.Json | undefined;
                } | null;
            };
            readonly humanWaits?: readonly {
                readonly executionId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly flowName: string;
                readonly status: "cancelled" | "completed" | "failed" | "pending" | "running" | "suspended";
                readonly createdAtMs: number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">;
                readonly startedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly finishedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly parentRunId: (string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">) | null;
                readonly lineageId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly roundOrdinal: number;
                readonly cancelRequestedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly treeVersion?: 1 | undefined;
                readonly parentPolicy?: "cancel" | "detach" | undefined;
                readonly waiting: {
                    readonly reason: string;
                    readonly wakeAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                    readonly tokenDigest: string | null;
                    readonly point?: string | null | undefined;
                    readonly request?: Schema.Json | undefined;
                } | null;
            }[] | undefined;
        } | undefined;
        readonly runId: string;
        readonly flowId: string;
        readonly status: "accepted" | "cancelled" | "completed" | "failed" | "parked" | "running" | "waiting-approval";
        readonly planId?: string | undefined;
        readonly planDigest?: string | undefined;
        readonly executionDigest?: string | undefined;
        readonly engineVersion?: string | undefined;
        readonly codeDrift?: {
            readonly recorded?: string | undefined;
            readonly current?: string | undefined;
            readonly recordedEngine?: string | undefined;
            readonly currentEngine?: string | undefined;
        } | undefined;
        readonly ownerId?: string | undefined;
        readonly launchedBy?: {
            readonly id: string;
            readonly kind: string;
        } | undefined;
        readonly parentRunId?: string | undefined;
        readonly lineageId?: string | undefined;
        readonly roundOrdinal?: number | undefined;
        readonly origin?: "child" | "continuation" | "fork" | undefined;
        readonly waitingReason?: string | undefined;
        readonly steering?: {
            readonly pending: number;
        } | undefined;
        readonly pendingResume?: number | undefined;
        readonly parkedBy?: string | undefined;
        readonly cancellation?: {
            readonly requestedAt: number;
            readonly source: "cascade" | "control" | "engine";
            readonly principal?: {
                readonly id: string;
                readonly kind: string;
                readonly stampedAt: number;
            } | undefined;
            readonly reason?: string | undefined;
            readonly cascadedFrom?: string | undefined;
        } | undefined;
        readonly pendingWaits?: readonly {
            readonly runId: string;
            readonly flowId?: string | undefined;
            readonly reason: string;
            readonly token: string;
            readonly tokenDigest?: string | undefined;
            readonly name?: string | undefined;
            readonly attempt?: number | undefined;
            readonly request?: Schema.Json | undefined;
            readonly createdAt: number;
        }[] | undefined;
        readonly deadlineAt?: number | undefined;
        readonly createdAt: number;
        readonly updatedAt: number;
    };
    plan: import("@smthrs/control/ControlRuntime").StoredPlan;
    input: unknown;
}, CodingError | import("@smthrs/control/ControlError").PersistenceError | import("@smthrs/control/ControlError").PlanNotFound | RunStore.RunStoreError, ControlRuntime | DurableEngineState.DurableEngineState | RunStore.RunStore>;
export declare const priorSetupReceipt: (input: SetupInput, operation: "evaluate" | "trial") => Effect.Effect<{
    readonly requestId: string;
    readonly runId: string;
    readonly revision: number;
    readonly operation: "apply" | "evaluate" | "inspect" | "pause" | "run" | "trial";
    readonly phase: "completed" | "failed" | "queued" | "running" | "stopped" | "waiting";
    readonly digest: string;
    readonly updatedAt: number;
    readonly results: readonly {
        readonly caseId: string;
        readonly status: "error" | "failed" | "passed" | "review";
        readonly observed: string;
        readonly evidence: readonly string[];
        readonly executionId: string;
    }[];
    readonly evidence: readonly string[];
    readonly error?: string;
    readonly trialIssue?: {
        readonly source: "github" | "smithers-cloud";
        readonly number: number;
        readonly url?: string;
    };
    readonly registrationId?: string;
    readonly sourceRevision?: string;
    readonly jobRunId?: string;
}, CodingError | import("@smthrs/control/ControlError").PersistenceError | import("@smthrs/control/ControlError").PlanNotFound | RunCatalogRead.RunCatalogError | import("@smthrs/control/ControlError").RunNotFound | RunStore.RunStoreError, ControlRuntime | DurableEngineState.DurableEngineState | RunCatalogRead.RunCatalogRead | RunStore.RunStore>;
export declare const completedJob: (runId: string, input: Pick<JobInput, "repo" | "job" | "revision" | "digest"> & {
    sourceRevision?: string;
}, event: {
    source: "github" | "smithers-cloud";
    issueNumber: number;
    deliveryKey?: string;
    manualStep?: string;
    trial?: boolean;
}) => Effect.Effect<{
    output: {
        readonly repo: string;
        readonly job: "chores" | "ci" | "feature" | "issues" | "review";
        readonly revision: number;
        readonly digest: string;
        readonly sourceRevision: string;
        readonly eventKey: string;
        readonly status: "completed" | "error" | "needs-author" | "needs-maintainer" | "partial" | "skipped";
        readonly results: readonly {
            readonly stepId: string;
            readonly status: "completed" | "error" | "needs-author" | "needs-maintainer" | "skipped";
            readonly summary: string;
            readonly evidence: readonly string[];
            readonly output: Schema.Json;
            readonly executionId: string;
        }[];
        readonly publicActions: readonly Schema.Json[];
        readonly reply?: {
            readonly body: string;
            readonly issueNumber: number;
            readonly state: "declined" | "drafted" | "posted" | "undeliverable";
            readonly reason?: string;
        };
    };
    run: {
        readonly executionObservation?: "missing" | "observed" | undefined;
        readonly executionView?: {
            readonly root: {
                readonly executionId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly flowName: string;
                readonly status: "cancelled" | "completed" | "failed" | "pending" | "running" | "suspended";
                readonly createdAtMs: number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">;
                readonly startedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly finishedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly parentRunId: (string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">) | null;
                readonly lineageId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly roundOrdinal: number;
                readonly cancelRequestedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly treeVersion?: 1 | undefined;
                readonly parentPolicy?: "cancel" | "detach" | undefined;
                readonly waiting: {
                    readonly reason: string;
                    readonly wakeAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                    readonly tokenDigest: string | null;
                    readonly point?: string | null | undefined;
                    readonly request?: Schema.Json | undefined;
                } | null;
            };
            readonly current: {
                readonly executionId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly flowName: string;
                readonly status: "cancelled" | "completed" | "failed" | "pending" | "running" | "suspended";
                readonly createdAtMs: number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">;
                readonly startedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly finishedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly parentRunId: (string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">) | null;
                readonly lineageId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly roundOrdinal: number;
                readonly cancelRequestedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly treeVersion?: 1 | undefined;
                readonly parentPolicy?: "cancel" | "detach" | undefined;
                readonly waiting: {
                    readonly reason: string;
                    readonly wakeAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                    readonly tokenDigest: string | null;
                    readonly point?: string | null | undefined;
                    readonly request?: Schema.Json | undefined;
                } | null;
            };
            readonly humanWaits?: readonly {
                readonly executionId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly flowName: string;
                readonly status: "cancelled" | "completed" | "failed" | "pending" | "running" | "suspended";
                readonly createdAtMs: number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">;
                readonly startedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly finishedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly parentRunId: (string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">) | null;
                readonly lineageId: string & import("effect/Brand").Brand<"@smthrs/journal/JournalEvent/RunId">;
                readonly roundOrdinal: number;
                readonly cancelRequestedAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                readonly treeVersion?: 1 | undefined;
                readonly parentPolicy?: "cancel" | "detach" | undefined;
                readonly waiting: {
                    readonly reason: string;
                    readonly wakeAtMs: (number & import("effect/Brand").Brand<"@smthrs/journal/TimestampMs">) | null;
                    readonly tokenDigest: string | null;
                    readonly point?: string | null | undefined;
                    readonly request?: Schema.Json | undefined;
                } | null;
            }[] | undefined;
        } | undefined;
        readonly runId: string;
        readonly flowId: string;
        readonly status: "accepted" | "cancelled" | "completed" | "failed" | "parked" | "running" | "waiting-approval";
        readonly planId?: string | undefined;
        readonly planDigest?: string | undefined;
        readonly executionDigest?: string | undefined;
        readonly engineVersion?: string | undefined;
        readonly codeDrift?: {
            readonly recorded?: string | undefined;
            readonly current?: string | undefined;
            readonly recordedEngine?: string | undefined;
            readonly currentEngine?: string | undefined;
        } | undefined;
        readonly ownerId?: string | undefined;
        readonly launchedBy?: {
            readonly id: string;
            readonly kind: string;
        } | undefined;
        readonly parentRunId?: string | undefined;
        readonly lineageId?: string | undefined;
        readonly roundOrdinal?: number | undefined;
        readonly origin?: "child" | "continuation" | "fork" | undefined;
        readonly waitingReason?: string | undefined;
        readonly steering?: {
            readonly pending: number;
        } | undefined;
        readonly pendingResume?: number | undefined;
        readonly parkedBy?: string | undefined;
        readonly cancellation?: {
            readonly requestedAt: number;
            readonly source: "cascade" | "control" | "engine";
            readonly principal?: {
                readonly id: string;
                readonly kind: string;
                readonly stampedAt: number;
            } | undefined;
            readonly reason?: string | undefined;
            readonly cascadedFrom?: string | undefined;
        } | undefined;
        readonly pendingWaits?: readonly {
            readonly runId: string;
            readonly flowId?: string | undefined;
            readonly reason: string;
            readonly token: string;
            readonly tokenDigest?: string | undefined;
            readonly name?: string | undefined;
            readonly attempt?: number | undefined;
            readonly request?: Schema.Json | undefined;
            readonly createdAt: number;
        }[] | undefined;
        readonly deadlineAt?: number | undefined;
        readonly createdAt: number;
        readonly updatedAt: number;
    };
    plan: import("@smthrs/control/ControlRuntime").StoredPlan;
    input: unknown;
    executionId: string;
} | undefined, CodingError | import("@smthrs/control/ControlError").PersistenceError | import("@smthrs/control/ControlError").PlanNotFound | RunCatalogRead.RunCatalogError | import("@smthrs/control/ControlError").RunNotFound | RunStore.RunStoreError, ControlRuntime | DurableEngineState.DurableEngineState | RunCatalogRead.RunCatalogRead | RunStore.RunStore>;
