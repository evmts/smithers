/** Measured source and repository history; no generated knowledge prerequisite. */
import { Action, FlowRuntime } from "@smthrs/flow";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import * as Jj from "../../../packages/smithers/flows/jj/src/Jj.ts";
import type { ImmutableSourceOptions } from "../coding/immutable-source.ts";
import { NativeCoding } from "../coding/native.ts";
import { type SourceReader } from "../coding/planning-sources.ts";
import { CodingError } from "../coding/schema.ts";
export declare const deploymentMinutes = 360;
export declare const deploymentTokens = 200000;
export declare const CaptureRepository: Action.Declared<"repository/capture", Schema.Struct<{
    repo: Schema.NonEmptyString;
    prompt: Schema.String;
    sourceRevision: Schema.optionalKey<Schema.String>;
    heldOut: Schema.optionalKey<Schema.Boolean>;
    event: Schema.optionalKey<Schema.Struct<{
        readonly source: Schema.Literals<readonly ["github", "smithers-cloud", "schedule"]>;
        readonly type: Schema.NonEmptyString;
        readonly action: Schema.String;
        readonly deliveryKey: Schema.NonEmptyString;
        readonly issueNumber: Schema.optionalKey<Schema.Int>;
        readonly trial: Schema.optionalKey<Schema.Boolean>;
        readonly manualStep: Schema.optionalKey<Schema.String>;
        readonly payload: Schema.Codec<Schema.Json, Schema.Json, never, never>;
        readonly approvedText: Schema.optionalKey<Schema.Struct<{
            readonly title: Schema.String;
            readonly body: Schema.String;
            readonly revision: Schema.String;
        }>>;
    }>>;
}>, Schema.Struct<{
    readonly repo: Schema.NonEmptyString;
    readonly source: Schema.Struct<{
        readonly changeId: Schema.NonEmptyString;
        readonly commitId: Schema.NonEmptyString;
        readonly treeId: Schema.NonEmptyString;
        readonly operationId: Schema.NonEmptyString;
        readonly parentCommitIds: Schema.$Array<Schema.NonEmptyString>;
    }>;
    readonly files: Schema.$Array<Schema.Struct<{
        readonly path: Schema.NonEmptyString;
        readonly digest: Schema.String;
        readonly text: Schema.String;
        readonly truncated: Schema.Boolean;
    }>>;
    readonly missing: Schema.$Array<Schema.String>;
    readonly history: Schema.$Array<Schema.Struct<{
        readonly commitId: Schema.String;
        readonly description: Schema.String;
    }>>;
    readonly records: Schema.$Array<Schema.Struct<{
        readonly source: Schema.Literals<readonly ["github", "smithers-cloud"]>;
        readonly kind: Schema.Literals<readonly ["issue", "pr"]>;
        readonly number: Schema.Int;
        readonly title: Schema.String;
        readonly body: Schema.String;
        readonly state: Schema.String;
        readonly url: Schema.String;
        readonly revision: Schema.optionalKey<Schema.String>;
    }>>;
    readonly sources: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly status: Schema.Literals<readonly ["read", "missing", "failed"]>;
        readonly summary: Schema.String;
        readonly revision: Schema.optionalKey<Schema.String>;
    }>>;
    readonly subject: Schema.optionalKey<Schema.Codec<Schema.Json, Schema.Json, never, never>>;
    readonly intake: Schema.optionalKey<Schema.Struct<{
        readonly action: Schema.String;
        readonly answers: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly kind: Schema.Literals<readonly ["bug", "feature", "question", "spam", "irrelevant"]>;
            readonly kindConfidence: Schema.Number;
            readonly urgency: Schema.Literals<readonly ["low", "medium", "high"]>;
            readonly urgencyConfidence: Schema.Number;
            readonly injection: Schema.Number;
            readonly withheld: Schema.Boolean;
        }>>;
        readonly kind: Schema.optionalKey<Schema.Literals<readonly ["bug", "feature", "question", "spam", "irrelevant"]>>;
        readonly urgency: Schema.optionalKey<Schema.Literals<readonly ["low", "medium", "high"]>>;
        readonly reason: Schema.optionalKey<Schema.String>;
    }>>;
}>, typeof CodingError, Action.Requirement<"repository/capture">>;
export type InspectionOptions = ImmutableSourceOptions;
/** The job already receives its reviewed configuration explicitly. Repository
 * links cannot smuggle its retained eval expectations into model evidence. */
export declare const repositorySourceReader: (root: string, fs: FileSystem.FileSystem) => Effect.Effect<SourceReader, never, Path.Path>;
/** The paths the prompt names, this repository's own CI workflow files, and its
 * standing guidance and manifests, each read through the same sandboxed reader. */
export declare const readRepositorySources: (options: InspectionOptions, root: string, prompt: string) => Effect.Effect<import("../coding/planning-sources.ts").Collected, never, Path.Path>;
export declare const captureRepository: (options: InspectionOptions, input: typeof CaptureRepository.payloadSchema.Type, mode?: "snapshot" | "immutable") => Effect.Effect<{
    repo: string;
    source: {
        readonly changeId: string;
        readonly commitId: string;
        readonly treeId: string;
        readonly operationId: string;
        readonly parentCommitIds: readonly string[];
    };
    files: readonly {
        readonly path: string;
        readonly digest: string;
        readonly text: string;
        readonly truncated: boolean;
    }[];
    missing: readonly string[];
    history: {
        commitId: string;
        description: string;
    }[];
    records: readonly {
        readonly source: "github" | "smithers-cloud";
        readonly kind: "issue" | "pr";
        readonly number: number;
        readonly title: string;
        readonly body: string;
        readonly state: string;
        readonly url: string;
        readonly revision?: string;
    }[];
    sources: ({
        readonly path: string;
        readonly status: "failed" | "missing" | "read";
        readonly summary: string;
        readonly revision?: string;
    } | {
        path: string;
        status: "missing";
        summary: string;
    })[];
}, CodingError, import("effect/process/ChildProcessSpawner").ChildProcessSpawner | Jj.Jj | NativeCoding | Path.Path>;
/** Captures one deadline for the whole durable invocation, never per subflow. */
export declare const StartBudget: Action.Declared<"repository/start-budget", Schema.Struct<{
    minutes: Schema.Number;
}>, Schema.Number, typeof CodingError, Action.Requirement<"repository/start-budget">>;
export declare const AssertBudget: Action.Declared<"repository/assert-budget", Schema.Struct<{
    deadlineAt: Schema.Number;
}>, Schema.Void, typeof CodingError, Action.Requirement<"repository/assert-budget">>;
export declare const inspectionLayers: (options: InspectionOptions) => Layer.Layer<Action.Requirement<"repository/assert-budget"> | Action.Requirement<"repository/capture"> | Action.Requirement<"repository/start-budget">, never, import("effect/process/ChildProcessSpawner").ChildProcessSpawner | FlowRuntime.FlowRuntime | Jj.Jj | NativeCoding | Path.Path>;
export declare const currentExecutionId: Effect.Effect<string, never, FlowRuntime.FlowInstance>;
