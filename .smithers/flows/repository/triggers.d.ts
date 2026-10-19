/** One repository flow, registered once on the schedule a person approved. */
import * as SeatResolver from "@smthrs/agent/SeatResolver";
import { ControlRuntime } from "@smthrs/control/ControlRuntime";
import * as RunCatalogRead from "@smthrs/engine-store/RunCatalogRead";
import { Action, Flow, FlowRuntime } from "@smthrs/flow";
import * as Descriptor from "@smthrs/registry/Descriptor";
import * as Registry from "@smthrs/registry/Registry";
import { Effect, Layer, Schema } from "effect";
import * as Jj from "../../../packages/smithers/flows/jj/src/Jj.ts";
import { NativeCoding } from "../coding/native.ts";
import { CodingError } from "../coding/schema.ts";
import { TriggerRequest } from "./schema.ts";
export declare const Dispatched: Schema.Struct<{
    readonly requestId: Schema.String;
    readonly slug: Schema.String;
    readonly flow: Schema.String;
    readonly dispatchId: Schema.String;
    readonly registrationId: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly status: Schema.String;
    readonly runId: Schema.optionalKey<Schema.String>;
}>;
export declare const TriggerOutcome: Schema.Union<readonly [Schema.Struct<{
    readonly requestId: Schema.String;
    readonly slug: Schema.String;
    readonly flow: Schema.String;
    readonly planId: Schema.String;
    readonly planDigest: Schema.String;
    readonly executionDigest: Schema.String;
    readonly envelope: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly sourceRevision: Schema.String;
    readonly testRunId: Schema.optionalKey<Schema.String>;
    readonly registration: Schema.Struct<{
        readonly registration_id: Schema.String;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly source_revision: Schema.String;
        readonly mode: Schema.Literal<"enabled">;
        readonly enabled: Schema.Boolean;
        readonly schedule: Schema.String;
        readonly next_fire_at: Schema.NullOr<Schema.String>;
        readonly timezone: Schema.Literal<"UTC">;
    }>;
}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly slug: Schema.String;
    readonly flow: Schema.String;
    readonly dispatchId: Schema.String;
    readonly registrationId: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly status: Schema.String;
    readonly runId: Schema.optionalKey<Schema.String>;
}>]>;
/** Recover only the exact saved, reviewed configuration, never defaults from the browser. */
export declare const recoverTriggerRequest: (request: TriggerRequest, inventory: unknown, workspaceId: string) => TriggerRequest | string;
export declare const ExecuteTrigger: Action.Declared<"repository/execute-trigger", Schema.Struct<{
    request: Schema.Struct<{
        readonly requestId: Schema.optionalKey<Schema.NonEmptyString>;
        readonly repo: Schema.NonEmptyString;
        readonly slug: Schema.String;
        readonly flow: Schema.String;
        readonly schedule: Schema.String;
        readonly input: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        readonly workspaceId: Schema.optionalKey<Schema.String>;
        readonly budget: Schema.optionalKey<Schema.Struct<{
            readonly tokens: Schema.Int;
            readonly milliseconds: Schema.Int;
        }>>;
        readonly approvedPlanId: Schema.optionalKey<Schema.String>;
        readonly approvedPlanDigest: Schema.optionalKey<Schema.String>;
        readonly testRunId: Schema.optionalKey<Schema.String>;
        readonly operation: Schema.Literals<readonly ["register", "fire", "resume"]>;
        readonly expectedRevision: Schema.optionalKey<Schema.Int>;
    }>;
    deadlineAt: Schema.Number;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly requestId: Schema.String;
    readonly slug: Schema.String;
    readonly flow: Schema.String;
    readonly planId: Schema.String;
    readonly planDigest: Schema.String;
    readonly executionDigest: Schema.String;
    readonly envelope: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly sourceRevision: Schema.String;
    readonly testRunId: Schema.optionalKey<Schema.String>;
    readonly registration: Schema.Struct<{
        readonly registration_id: Schema.String;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly source_revision: Schema.String;
        readonly mode: Schema.Literal<"enabled">;
        readonly enabled: Schema.Boolean;
        readonly schedule: Schema.String;
        readonly next_fire_at: Schema.NullOr<Schema.String>;
        readonly timezone: Schema.Literal<"UTC">;
    }>;
}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly slug: Schema.String;
    readonly flow: Schema.String;
    readonly dispatchId: Schema.String;
    readonly registrationId: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly status: Schema.String;
    readonly runId: Schema.optionalKey<Schema.String>;
}>]>, typeof CodingError, Action.Requirement<"repository/execute-trigger">>;
export declare const Trigger: Flow.Flow<"repository/Trigger", Schema.Struct<{
    readonly requestId: Schema.optionalKey<Schema.NonEmptyString>;
    readonly repo: Schema.NonEmptyString;
    readonly slug: Schema.String;
    readonly flow: Schema.String;
    readonly schedule: Schema.String;
    readonly input: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly workspaceId: Schema.optionalKey<Schema.String>;
    readonly budget: Schema.optionalKey<Schema.Struct<{
        readonly tokens: Schema.Int;
        readonly milliseconds: Schema.Int;
    }>>;
    readonly approvedPlanId: Schema.optionalKey<Schema.String>;
    readonly approvedPlanDigest: Schema.optionalKey<Schema.String>;
    readonly testRunId: Schema.optionalKey<Schema.String>;
    readonly operation: Schema.Literals<readonly ["register", "fire", "resume"]>;
    readonly expectedRevision: Schema.optionalKey<Schema.Int>;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly requestId: Schema.String;
    readonly slug: Schema.String;
    readonly flow: Schema.String;
    readonly planId: Schema.String;
    readonly planDigest: Schema.String;
    readonly executionDigest: Schema.String;
    readonly envelope: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly sourceRevision: Schema.String;
    readonly testRunId: Schema.optionalKey<Schema.String>;
    readonly registration: Schema.Struct<{
        readonly registration_id: Schema.String;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly source_revision: Schema.String;
        readonly mode: Schema.Literal<"enabled">;
        readonly enabled: Schema.Boolean;
        readonly schedule: Schema.String;
        readonly next_fire_at: Schema.NullOr<Schema.String>;
        readonly timezone: Schema.Literal<"UTC">;
    }>;
}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly slug: Schema.String;
    readonly flow: Schema.String;
    readonly dispatchId: Schema.String;
    readonly registrationId: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly status: Schema.String;
    readonly runId: Schema.optionalKey<Schema.String>;
}>]>, typeof CodingError, Action.Requirement<"repository/execute-trigger"> | Action.Requirement<"repository/start-budget">>;
export declare const RunTrigger: Flow.Flow<"repository/RunTrigger", Schema.Struct<{
    readonly flow: Schema.String;
    readonly input: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly prompt: Schema.String;
    readonly model: Schema.NullOr<Schema.Union<readonly [Schema.String, Schema.NonEmptyArray<Schema.String>]>>;
    readonly placement: Schema.NullOr<Schema.Literals<readonly ["client", "local", "sandbox", "remote"]>>;
    readonly placementOptions: Schema.withDecodingDefault<Schema.NullOr<Schema.Struct<{
        readonly image: Schema.optional<Schema.String>;
        readonly profile: Schema.optional<Schema.String>;
        readonly target: Schema.optional<Schema.String>;
    }>>, never>;
    readonly capabilities: Schema.$Array<Schema.String>;
    readonly flows: Schema.$Array<Schema.String>;
}>, Schema.Union<readonly [Schema.Struct<{
    readonly requestId: Schema.String;
    readonly slug: Schema.String;
    readonly flow: Schema.String;
    readonly planId: Schema.String;
    readonly planDigest: Schema.String;
    readonly executionDigest: Schema.String;
    readonly envelope: Schema.Codec<Schema.Json, Schema.Json, never, never>;
    readonly sourceRevision: Schema.String;
    readonly testRunId: Schema.optionalKey<Schema.String>;
    readonly registration: Schema.Struct<{
        readonly registration_id: Schema.String;
        readonly revision: Schema.Int;
        readonly digest: Schema.String;
        readonly source_revision: Schema.String;
        readonly mode: Schema.Literal<"enabled">;
        readonly enabled: Schema.Boolean;
        readonly schedule: Schema.String;
        readonly next_fire_at: Schema.NullOr<Schema.String>;
        readonly timezone: Schema.Literal<"UTC">;
    }>;
}>, Schema.Struct<{
    readonly requestId: Schema.String;
    readonly slug: Schema.String;
    readonly flow: Schema.String;
    readonly dispatchId: Schema.String;
    readonly registrationId: Schema.String;
    readonly revision: Schema.Int;
    readonly digest: Schema.String;
    readonly status: Schema.String;
    readonly runId: Schema.optionalKey<Schema.String>;
}>]>, typeof CodingError, Action.Requirement<"repository/refuse-trigger">>;
/** The form gate of the supported-flow contract, decided before any plan is
 * made. Every refusal names the flow and what about it cannot be scheduled.
 * A schedule runs one single-file markdown flow through the prompt branch
 * `AgentSession` launches, so the gate asks what that branch asks: a markdown
 * body, a `model:` line, and a seat this workspace resolves. */
export declare const admittedEntry: (flow: string) => Effect.Effect<Descriptor.FlowDescriptor, CodingError, Registry.Registry | SeatResolver.SeatResolver>;
export declare const triggerLayers: Layer.Layer<Action.Requirement<"repository/activate-trigger"> | Action.Requirement<"repository/execute-trigger"> | Action.Requirement<"repository/fire-trigger"> | Action.Requirement<"repository/prepare-trigger"> | Action.Requirement<"repository/recover-trigger"> | Action.Requirement<"repository/refuse-trigger"> | RunCatalogRead.RunCatalogRead, never, ControlRuntime | FlowRuntime.FlowRuntime | Action.Implementations | Jj.Jj | NativeCoding | Registry.Registry | SeatResolver.SeatResolver | import("effect/sql/SqlClient").SqlClient>;
