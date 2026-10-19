import { Action, Flow, FlowRuntime } from "@smthrs/flow";
import { Journal as JournalModules } from "@smthrs/flows";
import * as AttemptStore from "@smthrs/run-store/AttemptStore";
import * as RunStore from "@smthrs/run-store/RunStore";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { operations } from "./operations.ts";
import { Evidence, WikiError } from "./schema.ts";
export declare const policySources: readonly [".smithers/flows/wiki/flow.ts", ".smithers/flows/wiki/workflow.ts", ".smithers/flows/wiki/schema.ts", ".smithers/flows/wiki/evidence.ts", ".smithers/flows/wiki/runtime.ts", ".smithers/flows/wiki/jev-citations.ts"];
export declare const Provenance: Schema.Struct<{
    readonly originRunId: Schema.String;
    readonly policyDigest: Schema.String;
    readonly policySources: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly digest: Schema.String;
    }>>;
    readonly reusedFrom: Schema.NullOr<Schema.Struct<{
        readonly runId: Schema.NonEmptyString;
        readonly stepKeyDigest: Schema.NonEmptyString;
        readonly attempt: Schema.Int;
    }>>;
}>;
export type Provenance = typeof Provenance.Type;
export declare const Pool: Schema.Struct<{
    readonly policyDigest: Schema.String;
    readonly policySources: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly digest: Schema.String;
    }>>;
    readonly candidates: Schema.$Record<Schema.String, Schema.Struct<{
        readonly inputDigest: Schema.String;
        readonly contentDigest: Schema.String;
        readonly sectionsDigest: Schema.String;
        readonly review: Schema.Struct<{
            readonly sections: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
                readonly explanation: Schema.String;
                readonly citations: Schema.$Array<Schema.Struct<{
                    readonly path: Schema.String;
                    readonly line: Schema.Int;
                    readonly quote: Schema.NonEmptyString;
                }>>;
            }>>;
        }>;
        readonly reviewer: Schema.String;
        readonly attempt: Schema.Struct<{
            readonly runId: Schema.NonEmptyString;
            readonly stepKeyDigest: Schema.NonEmptyString;
            readonly attempt: Schema.Int;
        }>;
        readonly originRunId: Schema.String;
    }>>;
}>;
export type Pool = typeof Pool.Type;
declare const BoundPage: Schema.Struct<{
    readonly evidence: Schema.Struct<{
        readonly spec: Schema.Struct<{
            readonly id: Schema.String;
            readonly title: Schema.String;
            readonly purpose: Schema.String;
            readonly kind: Schema.Literals<readonly ["current", "intent"]>;
            readonly document: Schema.String;
            readonly sourceDirectory: Schema.optionalKey<Schema.String>;
            readonly inputs: Schema.$Array<Schema.String>;
            readonly related: Schema.$Array<Schema.String>;
            readonly excerpts: Schema.optional<Schema.$Record<Schema.String, Schema.$Array<Schema.Struct<{
                readonly start: Schema.Int;
                readonly end: Schema.Int;
            }>>>>;
        }>;
        readonly inputDigest: Schema.String;
        readonly contentDigest: Schema.String;
        readonly markdown: Schema.String;
        readonly sections: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly markdown: Schema.String;
        }>>;
        readonly sources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly digest: Schema.String;
            readonly text: Schema.String;
        }>>;
    }>;
    readonly review: Schema.NullOr<Schema.Struct<{
        readonly sections: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
            readonly explanation: Schema.String;
            readonly citations: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly line: Schema.Int;
                readonly quote: Schema.NonEmptyString;
            }>>;
        }>>;
    }>>;
    readonly reviewer: Schema.NullOr<Schema.String>;
    readonly provenance: Schema.Struct<{
        readonly originRunId: Schema.String;
        readonly policyDigest: Schema.String;
        readonly policySources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly digest: Schema.String;
        }>>;
        readonly reusedFrom: Schema.NullOr<Schema.Struct<{
            readonly runId: Schema.NonEmptyString;
            readonly stepKeyDigest: Schema.NonEmptyString;
            readonly attempt: Schema.Int;
        }>>;
    }>;
}>;
/** The reviews a run may reuse: a prior terminal run in this engine, or a pool
 * a trusted host carried from an earlier run elsewhere. */
export declare const Load: Action.Declared<"wiki/load-recorded-reviews", Schema.Struct<{
    priorRunId: Schema.optionalKey<Schema.String>;
    pool: Schema.optionalKey<Schema.Struct<{
        readonly policyDigest: Schema.String;
        readonly policySources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly digest: Schema.String;
        }>>;
        readonly candidates: Schema.$Record<Schema.String, Schema.Struct<{
            readonly inputDigest: Schema.String;
            readonly contentDigest: Schema.String;
            readonly sectionsDigest: Schema.String;
            readonly review: Schema.Struct<{
                readonly sections: Schema.$Array<Schema.Struct<{
                    readonly id: Schema.String;
                    readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
                    readonly explanation: Schema.String;
                    readonly citations: Schema.$Array<Schema.Struct<{
                        readonly path: Schema.String;
                        readonly line: Schema.Int;
                        readonly quote: Schema.NonEmptyString;
                    }>>;
                }>>;
            }>;
            readonly reviewer: Schema.String;
            readonly attempt: Schema.Struct<{
                readonly runId: Schema.NonEmptyString;
                readonly stepKeyDigest: Schema.NonEmptyString;
                readonly attempt: Schema.Int;
            }>;
            readonly originRunId: Schema.String;
        }>>;
    }>>;
    reviewer: Schema.String;
}>, Schema.Struct<{
    readonly policyDigest: Schema.String;
    readonly policySources: Schema.$Array<Schema.Struct<{
        readonly path: Schema.String;
        readonly digest: Schema.String;
    }>>;
    readonly candidates: Schema.$Record<Schema.String, Schema.Struct<{
        readonly inputDigest: Schema.String;
        readonly contentDigest: Schema.String;
        readonly sectionsDigest: Schema.String;
        readonly review: Schema.Struct<{
            readonly sections: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
                readonly explanation: Schema.String;
                readonly citations: Schema.$Array<Schema.Struct<{
                    readonly path: Schema.String;
                    readonly line: Schema.Int;
                    readonly quote: Schema.NonEmptyString;
                }>>;
            }>>;
        }>;
        readonly reviewer: Schema.String;
        readonly attempt: Schema.Struct<{
            readonly runId: Schema.NonEmptyString;
            readonly stepKeyDigest: Schema.NonEmptyString;
            readonly attempt: Schema.Int;
        }>;
        readonly originRunId: Schema.String;
    }>>;
}>, typeof WikiError, Action.Requirement<"wiki/load-recorded-reviews">>;
export declare const Select: Action.Declared<"wiki/select-recorded-review", Schema.Struct<{
    evidence: Schema.Struct<{
        readonly spec: Schema.Struct<{
            readonly id: Schema.String;
            readonly title: Schema.String;
            readonly purpose: Schema.String;
            readonly kind: Schema.Literals<readonly ["current", "intent"]>;
            readonly document: Schema.String;
            readonly sourceDirectory: Schema.optionalKey<Schema.String>;
            readonly inputs: Schema.$Array<Schema.String>;
            readonly related: Schema.$Array<Schema.String>;
            readonly excerpts: Schema.optional<Schema.$Record<Schema.String, Schema.$Array<Schema.Struct<{
                readonly start: Schema.Int;
                readonly end: Schema.Int;
            }>>>>;
        }>;
        readonly inputDigest: Schema.String;
        readonly contentDigest: Schema.String;
        readonly markdown: Schema.String;
        readonly sections: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly markdown: Schema.String;
        }>>;
        readonly sources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly digest: Schema.String;
            readonly text: Schema.String;
        }>>;
    }>;
    pool: Schema.Struct<{
        readonly policyDigest: Schema.String;
        readonly policySources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly digest: Schema.String;
        }>>;
        readonly candidates: Schema.$Record<Schema.String, Schema.Struct<{
            readonly inputDigest: Schema.String;
            readonly contentDigest: Schema.String;
            readonly sectionsDigest: Schema.String;
            readonly review: Schema.Struct<{
                readonly sections: Schema.$Array<Schema.Struct<{
                    readonly id: Schema.String;
                    readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
                    readonly explanation: Schema.String;
                    readonly citations: Schema.$Array<Schema.Struct<{
                        readonly path: Schema.String;
                        readonly line: Schema.Int;
                        readonly quote: Schema.NonEmptyString;
                    }>>;
                }>>;
            }>;
            readonly reviewer: Schema.String;
            readonly attempt: Schema.Struct<{
                readonly runId: Schema.NonEmptyString;
                readonly stepKeyDigest: Schema.NonEmptyString;
                readonly attempt: Schema.Int;
            }>;
            readonly originRunId: Schema.String;
        }>>;
    }>;
    reviewer: Schema.String;
}>, Schema.Struct<{
    readonly review: Schema.NullOr<Schema.Struct<{
        readonly sections: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
            readonly explanation: Schema.String;
            readonly citations: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly line: Schema.Int;
                readonly quote: Schema.NonEmptyString;
            }>>;
        }>>;
    }>>;
    readonly provenance: Schema.Struct<{
        readonly originRunId: Schema.String;
        readonly policyDigest: Schema.String;
        readonly policySources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly digest: Schema.String;
        }>>;
        readonly reusedFrom: Schema.NullOr<Schema.Struct<{
            readonly runId: Schema.NonEmptyString;
            readonly stepKeyDigest: Schema.NonEmptyString;
            readonly attempt: Schema.Int;
        }>>;
    }>;
    readonly reason: Schema.String;
}>, typeof WikiError, Action.Requirement<"wiki/select-recorded-review">>;
export declare const Bind: Action.Declared<"wiki/bind-review-provenance", Schema.Struct<{
    evidence: Schema.Struct<{
        readonly spec: Schema.Struct<{
            readonly id: Schema.String;
            readonly title: Schema.String;
            readonly purpose: Schema.String;
            readonly kind: Schema.Literals<readonly ["current", "intent"]>;
            readonly document: Schema.String;
            readonly sourceDirectory: Schema.optionalKey<Schema.String>;
            readonly inputs: Schema.$Array<Schema.String>;
            readonly related: Schema.$Array<Schema.String>;
            readonly excerpts: Schema.optional<Schema.$Record<Schema.String, Schema.$Array<Schema.Struct<{
                readonly start: Schema.Int;
                readonly end: Schema.Int;
            }>>>>;
        }>;
        readonly inputDigest: Schema.String;
        readonly contentDigest: Schema.String;
        readonly markdown: Schema.String;
        readonly sections: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly markdown: Schema.String;
        }>>;
        readonly sources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly digest: Schema.String;
            readonly text: Schema.String;
        }>>;
    }>;
    review: Schema.NullOr<Schema.Struct<{
        readonly sections: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
            readonly explanation: Schema.String;
            readonly citations: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly line: Schema.Int;
                readonly quote: Schema.NonEmptyString;
            }>>;
        }>>;
    }>>;
    reviewer: Schema.NullOr<Schema.String>;
    provenance: Schema.Struct<{
        readonly originRunId: Schema.String;
        readonly policyDigest: Schema.String;
        readonly policySources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly digest: Schema.String;
        }>>;
        readonly reusedFrom: Schema.NullOr<Schema.Struct<{
            readonly runId: Schema.NonEmptyString;
            readonly stepKeyDigest: Schema.NonEmptyString;
            readonly attempt: Schema.Int;
        }>>;
    }>;
}>, Schema.Struct<{
    readonly evidence: Schema.Struct<{
        readonly spec: Schema.Struct<{
            readonly id: Schema.String;
            readonly title: Schema.String;
            readonly purpose: Schema.String;
            readonly kind: Schema.Literals<readonly ["current", "intent"]>;
            readonly document: Schema.String;
            readonly sourceDirectory: Schema.optionalKey<Schema.String>;
            readonly inputs: Schema.$Array<Schema.String>;
            readonly related: Schema.$Array<Schema.String>;
            readonly excerpts: Schema.optional<Schema.$Record<Schema.String, Schema.$Array<Schema.Struct<{
                readonly start: Schema.Int;
                readonly end: Schema.Int;
            }>>>>;
        }>;
        readonly inputDigest: Schema.String;
        readonly contentDigest: Schema.String;
        readonly markdown: Schema.String;
        readonly sections: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly markdown: Schema.String;
        }>>;
        readonly sources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly digest: Schema.String;
            readonly text: Schema.String;
        }>>;
    }>;
    readonly review: Schema.NullOr<Schema.Struct<{
        readonly sections: Schema.$Array<Schema.Struct<{
            readonly id: Schema.String;
            readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
            readonly explanation: Schema.String;
            readonly citations: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly line: Schema.Int;
                readonly quote: Schema.NonEmptyString;
            }>>;
        }>>;
    }>>;
    readonly reviewer: Schema.NullOr<Schema.String>;
    readonly provenance: Schema.Struct<{
        readonly originRunId: Schema.String;
        readonly policyDigest: Schema.String;
        readonly policySources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly digest: Schema.String;
        }>>;
        readonly reusedFrom: Schema.NullOr<Schema.Struct<{
            readonly runId: Schema.NonEmptyString;
            readonly stepKeyDigest: Schema.NonEmptyString;
            readonly attempt: Schema.Int;
        }>>;
    }>;
}>, typeof WikiError, Action.Requirement<"wiki/bind-review-provenance">>;
export declare const Publish: Action.Declared<"wiki/publish-recorded-reviews", Schema.Struct<{
    pages: Schema.$Record<Schema.String, Schema.Struct<{
        readonly evidence: Schema.Struct<{
            readonly spec: Schema.Struct<{
                readonly id: Schema.String;
                readonly title: Schema.String;
                readonly purpose: Schema.String;
                readonly kind: Schema.Literals<readonly ["current", "intent"]>;
                readonly document: Schema.String;
                readonly sourceDirectory: Schema.optionalKey<Schema.String>;
                readonly inputs: Schema.$Array<Schema.String>;
                readonly related: Schema.$Array<Schema.String>;
                readonly excerpts: Schema.optional<Schema.$Record<Schema.String, Schema.$Array<Schema.Struct<{
                    readonly start: Schema.Int;
                    readonly end: Schema.Int;
                }>>>>;
            }>;
            readonly inputDigest: Schema.String;
            readonly contentDigest: Schema.String;
            readonly markdown: Schema.String;
            readonly sections: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly markdown: Schema.String;
            }>>;
            readonly sources: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly digest: Schema.String;
                readonly text: Schema.String;
            }>>;
        }>;
        readonly review: Schema.NullOr<Schema.Struct<{
            readonly sections: Schema.$Array<Schema.Struct<{
                readonly id: Schema.String;
                readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
                readonly explanation: Schema.String;
                readonly citations: Schema.$Array<Schema.Struct<{
                    readonly path: Schema.String;
                    readonly line: Schema.Int;
                    readonly quote: Schema.NonEmptyString;
                }>>;
            }>>;
        }>>;
        readonly reviewer: Schema.NullOr<Schema.String>;
        readonly provenance: Schema.Struct<{
            readonly originRunId: Schema.String;
            readonly policyDigest: Schema.String;
            readonly policySources: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly digest: Schema.String;
            }>>;
            readonly reusedFrom: Schema.NullOr<Schema.Struct<{
                readonly runId: Schema.NonEmptyString;
                readonly stepKeyDigest: Schema.NonEmptyString;
                readonly attempt: Schema.Int;
            }>>;
        }>;
    }>>;
}>, Schema.Struct<{
    readonly schemaVersion: Schema.Literal<1>;
    readonly sourceRevision: Schema.String;
    readonly inputDigest: Schema.String;
    readonly output: Schema.String;
    readonly pages: Schema.Int;
    readonly verification: Schema.Literals<readonly ["unreviewed", "verified", "needs-changes"]>;
}>, typeof WikiError, Action.Requirement<"wiki/publish-recorded-reviews">>;
export declare const IncrementalWiki: Flow.Flow<"smithers/IncrementalWiki", Schema.Struct<{
    readonly pages: Schema.$Array<Schema.Struct<{
        readonly id: Schema.String;
        readonly title: Schema.String;
        readonly purpose: Schema.String;
        readonly kind: Schema.Literals<readonly ["current", "intent"]>;
        readonly document: Schema.String;
        readonly sourceDirectory: Schema.optionalKey<Schema.String>;
        readonly inputs: Schema.$Array<Schema.String>;
        readonly related: Schema.$Array<Schema.String>;
        readonly excerpts: Schema.optional<Schema.$Record<Schema.String, Schema.$Array<Schema.Struct<{
            readonly start: Schema.Int;
            readonly end: Schema.Int;
        }>>>>;
    }>>;
    readonly reviewer: Schema.String;
    readonly mode: Schema.Literal<"verified">;
    readonly priorRunId: Schema.optionalKey<Schema.String>;
    readonly pool: Schema.optionalKey<Schema.Struct<{
        readonly policyDigest: Schema.String;
        readonly policySources: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly digest: Schema.String;
        }>>;
        readonly candidates: Schema.$Record<Schema.String, Schema.Struct<{
            readonly inputDigest: Schema.String;
            readonly contentDigest: Schema.String;
            readonly sectionsDigest: Schema.String;
            readonly review: Schema.Struct<{
                readonly sections: Schema.$Array<Schema.Struct<{
                    readonly id: Schema.String;
                    readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
                    readonly explanation: Schema.String;
                    readonly citations: Schema.$Array<Schema.Struct<{
                        readonly path: Schema.String;
                        readonly line: Schema.Int;
                        readonly quote: Schema.NonEmptyString;
                    }>>;
                }>>;
            }>;
            readonly reviewer: Schema.String;
            readonly attempt: Schema.Struct<{
                readonly runId: Schema.NonEmptyString;
                readonly stepKeyDigest: Schema.NonEmptyString;
                readonly attempt: Schema.Int;
            }>;
            readonly originRunId: Schema.String;
        }>>;
    }>>;
}>, Schema.Struct<{
    readonly schemaVersion: Schema.Literal<1>;
    readonly sourceRevision: Schema.String;
    readonly inputDigest: Schema.String;
    readonly output: Schema.String;
    readonly pages: Schema.Int;
    readonly verification: Schema.Literals<readonly ["unreviewed", "verified", "needs-changes"]>;
}>, Schema.Union<readonly [typeof WikiError, Schema.Union<readonly [typeof import("@smthrs/harness/StructuredOutput").StructuredOutputFailure, typeof import("@smthrs/agent/Seat").SeatUnresolved, typeof import("@smthrs/agent/Seat").SeatUnrouted, typeof import("@smthrs/agent/Budget").BudgetExceeded, typeof import("@smthrs/agent/Budget").Skipped, typeof import("@smthrs/harness/HarnessError").HarnessError, typeof import("@smthrs/plugin").PluginError]>]>, Action.Requirement<"wiki/bind-review-provenance"> | Action.Requirement<"wiki/check-citations"> | Action.Requirement<"wiki/collect-page"> | Action.Requirement<"wiki/load-recorded-reviews"> | Action.Requirement<"wiki/publish-recorded-reviews"> | Action.Requirement<"wiki/review-page"> | Action.Requirement<"wiki/select-recorded-review"> | Action.Requirement<"wiki/validate-review">>;
type ReuseOptions = Parameters<typeof operations>[0] & {
    readonly hostPolicy?: string | undefined;
};
export declare const reuseOperations: (options: ReuseOptions) => {
    policy: (reviewer: string) => Effect.Effect<{
        policyDigest: string;
        policySources: never[];
    } | {
        policyDigest: string;
        policySources: [{
            path: ".smithers/flows/wiki/evidence.ts" | ".smithers/flows/wiki/flow.ts" | ".smithers/flows/wiki/jev-citations.ts" | ".smithers/flows/wiki/runtime.ts" | ".smithers/flows/wiki/schema.ts" | ".smithers/flows/wiki/workflow.ts";
            digest: string;
        }, ...{
            path: ".smithers/flows/wiki/evidence.ts" | ".smithers/flows/wiki/flow.ts" | ".smithers/flows/wiki/jev-citations.ts" | ".smithers/flows/wiki/runtime.ts" | ".smithers/flows/wiki/schema.ts" | ".smithers/flows/wiki/workflow.ts";
            digest: string;
        }[]];
    }, import("effect/PlatformError").PlatformError | WikiError, import("effect/Crypto").Crypto | FileSystem.FileSystem | Path.Path>;
    load: ({ priorRunId, pool, reviewer }: {
        priorRunId?: string | undefined;
        pool?: Pool | undefined;
        reviewer: string;
    }) => Effect.Effect<{
        readonly policyDigest: string;
        readonly policySources: readonly {
            readonly path: string;
            readonly digest: string;
        }[];
        readonly candidates: {
            readonly [x: string]: {
                readonly inputDigest: string;
                readonly contentDigest: string;
                readonly sectionsDigest: string;
                readonly review: {
                    readonly sections: readonly {
                        readonly id: string;
                        readonly verdict: "supported" | "uncertain" | "unsupported";
                        readonly explanation: string;
                        readonly citations: readonly {
                            readonly path: string;
                            readonly line: number;
                            readonly quote: string;
                        }[];
                    }[];
                };
                readonly reviewer: string;
                readonly attempt: {
                    readonly runId: string;
                    readonly stepKeyDigest: string;
                    readonly attempt: number;
                };
                readonly originRunId: string;
            };
        };
    }, WikiError, AttemptStore.AttemptStore | import("effect/Crypto").Crypto | FileSystem.FileSystem | JournalModules.Journal.Journal | Path.Path | RunStore.RunStore>;
    select: ({ evidence, pool, reviewer }: {
        evidence: Evidence;
        pool: Pool;
        reviewer: string;
    }) => Effect.Effect<{
        readonly review: {
            readonly sections: readonly {
                readonly id: string;
                readonly verdict: "supported" | "uncertain" | "unsupported";
                readonly explanation: string;
                readonly citations: readonly {
                    readonly path: string;
                    readonly line: number;
                    readonly quote: string;
                }[];
            }[];
        } | null;
        readonly provenance: {
            readonly originRunId: string;
            readonly policyDigest: string;
            readonly policySources: readonly {
                readonly path: string;
                readonly digest: string;
            }[];
            readonly reusedFrom: {
                readonly runId: string;
                readonly stepKeyDigest: string;
                readonly attempt: number;
            } | null;
        };
        readonly reason: string;
    }, WikiError, import("effect/Crypto").Crypto | FlowRuntime.FlowInstance>;
    bind: (page: typeof BoundPage.Type) => Effect.Effect<{
        readonly evidence: {
            readonly spec: {
                readonly id: string;
                readonly title: string;
                readonly purpose: string;
                readonly kind: "current" | "intent";
                readonly document: string;
                readonly sourceDirectory?: string;
                readonly inputs: readonly string[];
                readonly related: readonly string[];
                readonly excerpts?: {
                    readonly [x: string]: readonly {
                        readonly start: number;
                        readonly end: number;
                    }[];
                } | undefined;
            };
            readonly inputDigest: string;
            readonly contentDigest: string;
            readonly markdown: string;
            readonly sections: readonly {
                readonly id: string;
                readonly markdown: string;
            }[];
            readonly sources: readonly {
                readonly path: string;
                readonly digest: string;
                readonly text: string;
            }[];
        };
        readonly review: {
            readonly sections: readonly {
                readonly id: string;
                readonly verdict: "supported" | "uncertain" | "unsupported";
                readonly explanation: string;
                readonly citations: readonly {
                    readonly path: string;
                    readonly line: number;
                    readonly quote: string;
                }[];
            }[];
        } | null;
        readonly reviewer: string | null;
        readonly provenance: {
            readonly originRunId: string;
            readonly policyDigest: string;
            readonly policySources: readonly {
                readonly path: string;
                readonly digest: string;
            }[];
            readonly reusedFrom: {
                readonly runId: string;
                readonly stepKeyDigest: string;
                readonly attempt: number;
            } | null;
        };
    }, WikiError, never>;
    publish: ({ pages }: {
        pages: Record<string, typeof BoundPage.Type>;
    }) => Effect.Effect<{
        schemaVersion: 1;
        sourceRevision: string;
        inputDigest: string;
        output: string;
        pages: number;
        verification: "needs-changes" | "unreviewed" | "verified";
    }, WikiError, import("effect/Crypto").Crypto | FileSystem.FileSystem | Path.Path>;
};
export declare const reuseLayers: (options: ReuseOptions) => Layer.Layer<Action.Requirement<"wiki/bind-review-provenance"> | Action.Requirement<"wiki/load-recorded-reviews"> | Action.Requirement<"wiki/publish-recorded-reviews"> | Action.Requirement<"wiki/select-recorded-review">, never, AttemptStore.AttemptStore | import("effect/Crypto").Crypto | FileSystem.FileSystem | FlowRuntime.FlowRuntime | Action.Implementations | JournalModules.Journal.Journal | Path.Path | RunStore.RunStore>;
export {};
