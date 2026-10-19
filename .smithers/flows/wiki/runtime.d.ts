/** Host composition reuses model routing and the existing runtime store. */
import * as Agent from "@smthrs/agent/Agent";
import * as AgentAction from "@smthrs/agent/AgentAction";
import * as Budget from "@smthrs/agent/Budget";
import * as QuotaPolicy from "@smthrs/agent/QuotaPolicy";
import type * as SeatResolver from "@smthrs/agent/SeatResolver";
import type * as SeatRouter from "@smthrs/agent/SeatRouter";
import { Action } from "@smthrs/flow";
import type * as Evaluator from "@smthrs/model/Evaluator";
import { Layer } from "effect";
import type * as HttpClient from "effect/http/HttpClient";
import { operations } from "./operations.ts";
/** The same subscription judge and proxy-aware transport as the native host. */
export declare const hostEvaluator: (environment: Readonly<Record<string, string | undefined>>, jevHttp?: Layer.Layer<HttpClient.HttpClient>) => Layer.Layer<Evaluator.Evaluator>;
export declare const agentLayers: (seats: Layer.Layer<SeatResolver.SeatResolver>, maxReviewMillis: number, evaluator?: Layer.Layer<Evaluator.Evaluator>, options?: {
    readonly environment?: Readonly<Record<string, string | undefined>>;
    readonly catalog?: Layer.Layer<SeatRouter.Catalog>;
}) => Layer.Layer<Agent.Agent | Budget.Budget | SeatRouter.Catalog | Evaluator.Evaluator | AgentAction.Host | QuotaPolicy.QuotaClassifier | Action.Requirement<"wiki/review-page"> | import("@smthrs/harness/Sandbox").Sandbox | SeatResolver.SeatResolver | import("@smthrs/harness/Steering").Source, Budget.ConfigurationError | import("@smthrs/harness/Sandbox").SandboxError, import("effect/Crypto").Crypto | import("effect/FileSystem").FileSystem | import("@smthrs/flow/FlowRuntime").FlowRuntime | import("effect/Path").Path>;
export declare const registration: (options: {
    readonly root: string;
    readonly output: string;
    readonly evaluator: Layer.Layer<Evaluator.Evaluator>;
}, reviewers: ReturnType<typeof agentLayers>) => Layer.Layer<Agent.Agent | Budget.Budget | SeatRouter.Catalog | Evaluator.Evaluator | AgentAction.Host | Action.Implementations | QuotaPolicy.QuotaClassifier | Action.Requirement<"wiki/assess-review"> | Action.Requirement<"wiki/check-citations"> | Action.Requirement<"wiki/collect-page"> | Action.Requirement<"wiki/review-page"> | Action.Requirement<"wiki/validate-review"> | Action.Requirement<"wiki/write-snapshot"> | import("@smthrs/harness/Sandbox").Sandbox | SeatResolver.SeatResolver | import("@smthrs/harness/Steering").Source, Budget.ConfigurationError | import("@smthrs/harness/Sandbox").SandboxError, import("effect/Crypto").Crypto | import("effect/FileSystem").FileSystem | import("@smthrs/flow/FlowRuntime").FlowRuntime | import("effect/Path").Path>;
/** Verified hosts select their judge before any resources open. Preview has
 * no agent or semantic verification path; a test supplies a scripted judge. */
export declare const actionLayers: (options: Parameters<typeof operations>[0] & {
    readonly verify?: boolean;
    readonly evaluator?: Layer.Layer<Evaluator.Evaluator> | undefined;
}) => Layer.Layer<Action.Requirement<"wiki/assess-review"> | Action.Requirement<"wiki/check-citations"> | Action.Requirement<"wiki/collect-page"> | Action.Requirement<"wiki/validate-review"> | Action.Requirement<"wiki/write-snapshot">, never, import("effect/Crypto").Crypto | import("effect/FileSystem").FileSystem | import("@smthrs/flow/FlowRuntime").FlowRuntime | import("effect/Path").Path>;
