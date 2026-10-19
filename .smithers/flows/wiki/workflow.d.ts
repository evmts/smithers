/** One independently keyed source/review pair per page, using ordinary flows. */
import * as AgentAction from "@smthrs/agent/AgentAction";
import { Action } from "@smthrs/flow";
import { Node } from "@smthrs/plan";
import { Schema } from "effect";
import { WikiError } from "./schema.ts";
export declare const Collect: Action.Declared<"wiki/collect-page", Schema.Struct<{
    spec: Schema.Struct<{
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
}>, Schema.Struct<{
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
}>, typeof WikiError, Action.Requirement<"wiki/collect-page">>;
export declare const ReviewPage: AgentAction.AgentAction<"wiki/review-page", Schema.Struct<{
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
    priorReview: Schema.optionalKey<Schema.NullOr<Schema.Struct<{
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
    }>>>;
    correction: Schema.optionalKey<Schema.String>;
}>, Schema.Struct<{
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
/** Only the review is returned; canonical assessed page outcomes remain unique
 * for the existing native receipt lookup. */
export declare const ValidateReview: Action.Declared<"wiki/validate-review", Schema.Struct<{
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
}>, Schema.Struct<{
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
}>, typeof WikiError, Action.Requirement<"wiki/validate-review">>;
/** Jev judges whether each exactly resolved citation supports the claim it is
 * attached to. It runs on the host, after exact assessment and outside the
 * repair loop: an exact citation that does not support its claim is a refusal
 * the reviewer cannot fix by moving a line number, and a Jev the host cannot
 * reach is not the reviewer's fault, so neither spends a model call. */
export declare const CheckedReview: Schema.Struct<{
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
    readonly citations: Schema.Struct<{
        readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
        readonly citations: Schema.$Array<Schema.Struct<{
            readonly section: Schema.String;
            readonly path: Schema.String;
            readonly line: Schema.Int;
            readonly quote: Schema.String;
            readonly choice: Schema.Literals<readonly ["supports", "contradicts", "unrelated"]>;
            readonly confidence: Schema.Number;
            readonly outcome: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
        }>>;
    }>;
}>;
export declare const CheckCitations: Action.Declared<"wiki/check-citations", Schema.Struct<{
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
    review: Schema.Struct<{
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
}>, Schema.Struct<{
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
    readonly citations: Schema.Struct<{
        readonly verdict: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
        readonly citations: Schema.$Array<Schema.Struct<{
            readonly section: Schema.String;
            readonly path: Schema.String;
            readonly line: Schema.Int;
            readonly quote: Schema.String;
            readonly choice: Schema.Literals<readonly ["supports", "contradicts", "unrelated"]>;
            readonly confidence: Schema.Number;
            readonly outcome: Schema.Literals<readonly ["supported", "unsupported", "uncertain"]>;
        }>>;
    }>;
}>, typeof WikiError, Action.Requirement<"wiki/check-citations">>;
/** One semantic correction after a structurally decoded review fails exact
 * assessment. The second validation failure is terminal. Every review that
 * survives it then has its citations checked for support. */
export declare const validateOrRepairReview: (evidence: Parameters<typeof ValidateReview.call>[0]["evidence"], review: Parameters<typeof ValidateReview.call>[0]["review"]) => Node.Node<{
    sections: {
        readonly id: string;
        readonly verdict: "supported" | "uncertain" | "unsupported";
        readonly explanation: string;
        readonly citations: readonly {
            readonly path: string;
            readonly line: number;
            readonly quote: string;
        }[];
    }[];
}, import("@smthrs/agent/Budget").BudgetExceeded | import("@smthrs/harness/HarnessError").HarnessError | import("@smthrs/plugin").PluginError | import("@smthrs/agent/Seat").SeatUnresolved | import("@smthrs/agent/Seat").SeatUnrouted | import("@smthrs/agent/Budget").Skipped | import("@smthrs/harness/StructuredOutput").StructuredOutputFailure | WikiError, Action.Requirement<"wiki/check-citations"> | Action.Requirement<"wiki/review-page"> | Action.Requirement<"wiki/validate-review">>;
export declare const Assess: Action.Declared<"wiki/assess-review", Schema.Struct<{
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
}>, typeof WikiError, Action.Requirement<"wiki/assess-review">>;
export declare const Write: Action.Declared<"wiki/write-snapshot", Schema.Struct<{
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
    }>>;
    mode: Schema.Literals<readonly ["preview", "verified"]>;
}>, Schema.Struct<{
    readonly schemaVersion: Schema.Literal<1>;
    readonly sourceRevision: Schema.String;
    readonly inputDigest: Schema.String;
    readonly output: Schema.String;
    readonly pages: Schema.Int;
    readonly verification: Schema.Literals<readonly ["unreviewed", "verified", "needs-changes"]>;
}>, typeof WikiError, Action.Requirement<"wiki/write-snapshot">>;
