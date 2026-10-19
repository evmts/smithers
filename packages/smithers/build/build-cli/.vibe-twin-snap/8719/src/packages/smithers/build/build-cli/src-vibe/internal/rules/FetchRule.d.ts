/**
 * The first paired package rule. The coordinator still owns admission,
 * cancellation, cache replay, output capture and provenance publication.
 * @since 1.0.0
 */
import type * as Rule from "../RuleContract.js";
import * as FetchExecutor from "./FetchExecutor.js";
import * as FetchPlan from "./FetchPlan.js";
/** The exact Fetch planner/executor pair behind the shared family contract.
 * @category execution
 * @since 1.0.0
 */
export declare const contract: Rule.Contract<Rule.Fetch, Parameters<typeof FetchPlan.plan>[0], FetchExecutor.Result>;
