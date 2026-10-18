/**
 * The repository setup contract: the editable candidate, the host's receipts for
 * what it executed, and the registration the registry holds. The app, the Worker
 * and the installed repository flow all decode the same shapes here, so a draft
 * one side stores is the draft the other side runs.
 *
 * @since 1.0.0
 */
import { z } from "zod";
/**
 * Independently configured repository responsibilities.
 *
 * @since 1.0.0
 * @category constants
 */
export declare const REPOSITORY_JOBS: readonly ["issues", "review", "ci", "feature", "chores"];
/**
 * A job whose setup does not activate any other job.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const RepositoryJobSchema: z.ZodEnum<{
    chores: "chores";
    ci: "ci";
    feature: "feature";
    issues: "issues";
    review: "review";
}>;
/**
 * A configured repository responsibility.
 *
 * @since 1.0.0
 * @category models
 */
export type RepositoryJob = z.infer<typeof RepositoryJobSchema>;
/**
 * A separately requested operation on one candidate.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupOperationSchema: z.ZodEnum<{
    apply: "apply";
    evaluate: "evaluate";
    inspect: "inspect";
    pause: "pause";
    run: "run";
    trial: "trial";
}>;
/**
 * A maintainer's request; the host resolves the subject into a trusted event.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupManualRequestSchema: z.ZodObject<{
    stepId: z.ZodString;
    prompt: z.ZodString;
    subject: z.ZodOptional<z.ZodObject<{
        source: z.ZodEnum<{
            github: "github";
            "smithers-cloud": "smithers-cloud";
        }>;
        kind: z.ZodEnum<{
            issue: "issue";
            pr: "pr";
        }>;
        number: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * Input for a single manually requested step.
 *
 * @since 1.0.0
 * @category models
 */
export type SetupManualRequest = z.infer<typeof SetupManualRequestSchema>;
/**
 * User-facing names shared by the entry points and settings card.
 *
 * @since 1.0.0
 * @category constants
 */
export declare const REPOSITORY_JOB_TITLES: Record<RepositoryJob, string>;
/**
 * One editable step of an ordinary repository flow.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupStepSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    mode: z.ZodEnum<{
        approved: "approved";
        automatic: "automatic";
        manual: "manual";
        off: "off";
    }>;
    prompt: z.ZodString;
}, z.core.$strip>;
/**
 * A selected deterministic or semantic check.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupCheckSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    kind: z.ZodEnum<{
        ai: "ai";
        command: "command";
    }>;
    rule: z.ZodString;
    paths: z.ZodArray<z.ZodString>;
    policy: z.ZodEnum<{
        report: "report";
        required: "required";
    }>;
}, z.core.$strip>;
/**
 * Reviewed expectations remain distinct from the observed result.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupEvalCaseSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    input: z.ZodString;
    expected: z.ZodString;
    source: z.ZodOptional<z.ZodString>;
    edited: z.ZodOptional<z.ZodBoolean>;
    required: z.ZodBoolean;
}, z.core.$strip>;
/**
 * Repository events a chore may start on; Plue delivers no other rule for one.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupChoreEventSchema: z.ZodEnum<{
    labeled: "labeled";
    none: "none";
    push: "push";
}>;
/**
 * What one unattended run may spend, as the host's registrar bounds it
 * (`.smithers/flows/repository/inspection.ts` `deploymentTokens`). `budgetMinutes` below
 * bounds the same run's time at the same deployment's `deploymentMinutes`, and
 * a job registered past either one is refused where it runs, so both hosts
 * hold a person to the pair before anything is written.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const BudgetTokensSchema: z.ZodNumber;
/**
 * The editable draft; it carries no authority to activate automation.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupDraftSchema: z.ZodObject<{
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        mode: z.ZodEnum<{
            approved: "approved";
            automatic: "automatic";
            manual: "manual";
            off: "off";
        }>;
        prompt: z.ZodString;
    }, z.core.$strip>>;
    checks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        kind: z.ZodEnum<{
            ai: "ai";
            command: "command";
        }>;
        rule: z.ZodString;
        paths: z.ZodArray<z.ZodString>;
        policy: z.ZodEnum<{
            report: "report";
            required: "required";
        }>;
    }, z.core.$strip>>;
    cases: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        input: z.ZodString;
        expected: z.ZodString;
        source: z.ZodOptional<z.ZodString>;
        edited: z.ZodOptional<z.ZodBoolean>;
        required: z.ZodBoolean;
    }, z.core.$strip>>;
    replies: z.ZodEnum<{
        automatic: "automatic";
        draft: "draft";
    }>;
    landing: z.ZodEnum<{
        ask: "ask";
        checks: "checks";
    }>;
    scope: z.ZodEnum<{
        future: "future";
        label: "label";
    }>;
    label: z.ZodString;
    schedule: z.ZodString;
    choreEvent: z.ZodDefault<z.ZodEnum<{
        labeled: "labeled";
        none: "none";
        push: "push";
    }>>;
    budgetMinutes: z.ZodNumber;
    connectIssues: z.ZodBoolean;
    trialTitle: z.ZodString;
    trialBody: z.ZodString;
}, z.core.$strip>;
/**
 * A draft serialized into repository-owned flows and prompts.
 *
 * @since 1.0.0
 * @category models
 */
export type SetupDraft = z.infer<typeof SetupDraftSchema>;
/**
 * Real source read during repository inspection.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupSourceSchema: z.ZodObject<{
    path: z.ZodString;
    status: z.ZodEnum<{
        failed: "failed";
        missing: "missing";
        read: "read";
    }>;
    summary: z.ZodString;
    revision: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * A single evaluated case, with direct evidence.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupEvalResultSchema: z.ZodObject<{
    caseId: z.ZodString;
    status: z.ZodEnum<{
        error: "error";
        failed: "failed";
        passed: "passed";
        review: "review";
    }>;
    observed: z.ZodString;
    evidence: z.ZodArray<z.ZodString>;
    executionId: z.ZodString;
}, z.core.$strip>;
/**
 * The host's receipt for an executed operation on an exact candidate.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupReceiptSchema: z.ZodObject<{
    requestId: z.ZodString;
    runId: z.ZodOptional<z.ZodString>;
    jobRunId: z.ZodOptional<z.ZodString>;
    revision: z.ZodNumber;
    operation: z.ZodEnum<{
        apply: "apply";
        evaluate: "evaluate";
        inspect: "inspect";
        pause: "pause";
        run: "run";
        trial: "trial";
    }>;
    phase: z.ZodEnum<{
        completed: "completed";
        failed: "failed";
        queued: "queued";
        running: "running";
        stopped: "stopped";
        waiting: "waiting";
    }>;
    digest: z.ZodString;
    updatedAt: z.ZodNumber;
    results: z.ZodArray<z.ZodObject<{
        caseId: z.ZodString;
        status: z.ZodEnum<{
            error: "error";
            failed: "failed";
            passed: "passed";
            review: "review";
        }>;
        observed: z.ZodString;
        evidence: z.ZodArray<z.ZodString>;
        executionId: z.ZodString;
    }, z.core.$strip>>;
    evidence: z.ZodArray<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
    observation: z.ZodOptional<z.ZodObject<{
        state: z.ZodEnum<{
            blocked: "blocked";
            failed: "failed";
        }>;
        code: z.ZodEnum<{
            runtime_unavailable: "runtime_unavailable";
            runtime_unrecoverable: "runtime_unrecoverable";
        }>;
        observedAt: z.ZodNumber;
    }, z.core.$strip>>;
    trialIssue: z.ZodOptional<z.ZodObject<{
        source: z.ZodEnum<{
            github: "github";
            "smithers-cloud": "smithers-cloud";
        }>;
        number: z.ZodNumber;
        url: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    registrationId: z.ZodOptional<z.ZodString>;
    sourceRevision: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * A host receipt is evidence, not a client-set status flag.
 *
 * @since 1.0.0
 * @category models
 */
export type SetupReceipt = z.infer<typeof SetupReceiptSchema>;
/**
 * A persisted operation intent. The same request survives reloads.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupRequestSchema: z.ZodObject<{
    id: z.ZodString;
    operation: z.ZodEnum<{
        apply: "apply";
        evaluate: "evaluate";
        inspect: "inspect";
        pause: "pause";
        run: "run";
        trial: "trial";
    }>;
    revision: z.ZodNumber;
    digest: z.ZodString;
    state: z.ZodEnum<{
        completed: "completed";
        failed: "failed";
        requested: "requested";
        running: "running";
    }>;
    error: z.ZodOptional<z.ZodString>;
    manual: z.ZodOptional<z.ZodObject<{
        stepId: z.ZodString;
        prompt: z.ZodString;
        subject: z.ZodOptional<z.ZodObject<{
            source: z.ZodEnum<{
                github: "github";
                "smithers-cloud": "smithers-cloud";
            }>;
            kind: z.ZodEnum<{
                issue: "issue";
                pr: "pr";
            }>;
            number: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    observeOnly: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
/**
 * Backend policy truth is separate from evidence that can authorize a new candidate.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupScheduleSchema: z.ZodObject<{
    expression: z.ZodString;
    nextFireAt: z.ZodISODateTime;
}, z.core.$strip>;
/**
 * The registry's current policy and optional scheduler observation.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupRegistrationSchema: z.ZodObject<{
    registrationId: z.ZodString;
    workspaceId: z.ZodString;
    revision: z.ZodNumber;
    digest: z.ZodString;
    sourceRevision: z.ZodString;
    enabled: z.ZodBoolean;
    owned: z.ZodBoolean;
    draft: z.ZodObject<{
        steps: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            mode: z.ZodEnum<{
                approved: "approved";
                automatic: "automatic";
                manual: "manual";
                off: "off";
            }>;
            prompt: z.ZodString;
        }, z.core.$strip>>;
        checks: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            kind: z.ZodEnum<{
                ai: "ai";
                command: "command";
            }>;
            rule: z.ZodString;
            paths: z.ZodArray<z.ZodString>;
            policy: z.ZodEnum<{
                report: "report";
                required: "required";
            }>;
        }, z.core.$strip>>;
        cases: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            input: z.ZodString;
            expected: z.ZodString;
            source: z.ZodOptional<z.ZodString>;
            edited: z.ZodOptional<z.ZodBoolean>;
            required: z.ZodBoolean;
        }, z.core.$strip>>;
        replies: z.ZodEnum<{
            automatic: "automatic";
            draft: "draft";
        }>;
        landing: z.ZodEnum<{
            ask: "ask";
            checks: "checks";
        }>;
        scope: z.ZodEnum<{
            future: "future";
            label: "label";
        }>;
        label: z.ZodString;
        schedule: z.ZodString;
        choreEvent: z.ZodDefault<z.ZodEnum<{
            labeled: "labeled";
            none: "none";
            push: "push";
        }>>;
        budgetMinutes: z.ZodNumber;
        connectIssues: z.ZodBoolean;
        trialTitle: z.ZodString;
        trialBody: z.ZodString;
    }, z.core.$strip>;
    schedule: z.ZodOptional<z.ZodObject<{
        expression: z.ZodString;
        nextFireAt: z.ZodISODateTime;
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * The settings card projects a draft and separately verified active version.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const RepositorySetupSchema: z.ZodObject<{
    repo: z.ZodString;
    job: z.ZodEnum<{
        chores: "chores";
        ci: "ci";
        feature: "feature";
        issues: "issues";
        review: "review";
    }>;
    revision: z.ZodNumber;
    owner: z.ZodNullable<z.ZodString>;
    workspaceId: z.ZodOptional<z.ZodString>;
    draft: z.ZodObject<{
        steps: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            mode: z.ZodEnum<{
                approved: "approved";
                automatic: "automatic";
                manual: "manual";
                off: "off";
            }>;
            prompt: z.ZodString;
        }, z.core.$strip>>;
        checks: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            kind: z.ZodEnum<{
                ai: "ai";
                command: "command";
            }>;
            rule: z.ZodString;
            paths: z.ZodArray<z.ZodString>;
            policy: z.ZodEnum<{
                report: "report";
                required: "required";
            }>;
        }, z.core.$strip>>;
        cases: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            input: z.ZodString;
            expected: z.ZodString;
            source: z.ZodOptional<z.ZodString>;
            edited: z.ZodOptional<z.ZodBoolean>;
            required: z.ZodBoolean;
        }, z.core.$strip>>;
        replies: z.ZodEnum<{
            automatic: "automatic";
            draft: "draft";
        }>;
        landing: z.ZodEnum<{
            ask: "ask";
            checks: "checks";
        }>;
        scope: z.ZodEnum<{
            future: "future";
            label: "label";
        }>;
        label: z.ZodString;
        schedule: z.ZodString;
        choreEvent: z.ZodDefault<z.ZodEnum<{
            labeled: "labeled";
            none: "none";
            push: "push";
        }>>;
        budgetMinutes: z.ZodNumber;
        connectIssues: z.ZodBoolean;
        trialTitle: z.ZodString;
        trialBody: z.ZodString;
    }, z.core.$strip>;
    view: z.ZodEnum<{
        checks: "checks";
        evals: "evals";
        flows: "flows";
        prompts: "prompts";
        test: "test";
        work: "work";
    }>;
    selectedStep: z.ZodString;
    manualDraft: z.ZodOptional<z.ZodObject<{
        stepId: z.ZodString;
        prompt: z.ZodString;
        source: z.ZodEnum<{
            github: "github";
            "smithers-cloud": "smithers-cloud";
        }>;
        number: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    guidance: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        state: z.ZodEnum<{
            admitted: "admitted";
            failed: "failed";
            requested: "requested";
        }>;
        error: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    sources: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        status: z.ZodEnum<{
            failed: "failed";
            missing: "missing";
            read: "read";
        }>;
        summary: z.ZodString;
        revision: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    inspectedAt: z.ZodOptional<z.ZodNumber>;
    request: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        operation: z.ZodEnum<{
            apply: "apply";
            evaluate: "evaluate";
            inspect: "inspect";
            pause: "pause";
            run: "run";
            trial: "trial";
        }>;
        revision: z.ZodNumber;
        digest: z.ZodString;
        state: z.ZodEnum<{
            completed: "completed";
            failed: "failed";
            requested: "requested";
            running: "running";
        }>;
        error: z.ZodOptional<z.ZodString>;
        manual: z.ZodOptional<z.ZodObject<{
            stepId: z.ZodString;
            prompt: z.ZodString;
            subject: z.ZodOptional<z.ZodObject<{
                source: z.ZodEnum<{
                    github: "github";
                    "smithers-cloud": "smithers-cloud";
                }>;
                kind: z.ZodEnum<{
                    issue: "issue";
                    pr: "pr";
                }>;
                number: z.ZodNumber;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        observeOnly: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    evaluation: z.ZodOptional<z.ZodObject<{
        requestId: z.ZodString;
        runId: z.ZodOptional<z.ZodString>;
        jobRunId: z.ZodOptional<z.ZodString>;
        revision: z.ZodNumber;
        operation: z.ZodEnum<{
            apply: "apply";
            evaluate: "evaluate";
            inspect: "inspect";
            pause: "pause";
            run: "run";
            trial: "trial";
        }>;
        phase: z.ZodEnum<{
            completed: "completed";
            failed: "failed";
            queued: "queued";
            running: "running";
            stopped: "stopped";
            waiting: "waiting";
        }>;
        digest: z.ZodString;
        updatedAt: z.ZodNumber;
        results: z.ZodArray<z.ZodObject<{
            caseId: z.ZodString;
            status: z.ZodEnum<{
                error: "error";
                failed: "failed";
                passed: "passed";
                review: "review";
            }>;
            observed: z.ZodString;
            evidence: z.ZodArray<z.ZodString>;
            executionId: z.ZodString;
        }, z.core.$strip>>;
        evidence: z.ZodArray<z.ZodString>;
        error: z.ZodOptional<z.ZodString>;
        observation: z.ZodOptional<z.ZodObject<{
            state: z.ZodEnum<{
                blocked: "blocked";
                failed: "failed";
            }>;
            code: z.ZodEnum<{
                runtime_unavailable: "runtime_unavailable";
                runtime_unrecoverable: "runtime_unrecoverable";
            }>;
            observedAt: z.ZodNumber;
        }, z.core.$strip>>;
        trialIssue: z.ZodOptional<z.ZodObject<{
            source: z.ZodEnum<{
                github: "github";
                "smithers-cloud": "smithers-cloud";
            }>;
            number: z.ZodNumber;
            url: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        registrationId: z.ZodOptional<z.ZodString>;
        sourceRevision: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    trial: z.ZodOptional<z.ZodObject<{
        requestId: z.ZodString;
        runId: z.ZodOptional<z.ZodString>;
        jobRunId: z.ZodOptional<z.ZodString>;
        revision: z.ZodNumber;
        operation: z.ZodEnum<{
            apply: "apply";
            evaluate: "evaluate";
            inspect: "inspect";
            pause: "pause";
            run: "run";
            trial: "trial";
        }>;
        phase: z.ZodEnum<{
            completed: "completed";
            failed: "failed";
            queued: "queued";
            running: "running";
            stopped: "stopped";
            waiting: "waiting";
        }>;
        digest: z.ZodString;
        updatedAt: z.ZodNumber;
        results: z.ZodArray<z.ZodObject<{
            caseId: z.ZodString;
            status: z.ZodEnum<{
                error: "error";
                failed: "failed";
                passed: "passed";
                review: "review";
            }>;
            observed: z.ZodString;
            evidence: z.ZodArray<z.ZodString>;
            executionId: z.ZodString;
        }, z.core.$strip>>;
        evidence: z.ZodArray<z.ZodString>;
        error: z.ZodOptional<z.ZodString>;
        observation: z.ZodOptional<z.ZodObject<{
            state: z.ZodEnum<{
                blocked: "blocked";
                failed: "failed";
            }>;
            code: z.ZodEnum<{
                runtime_unavailable: "runtime_unavailable";
                runtime_unrecoverable: "runtime_unrecoverable";
            }>;
            observedAt: z.ZodNumber;
        }, z.core.$strip>>;
        trialIssue: z.ZodOptional<z.ZodObject<{
            source: z.ZodEnum<{
                github: "github";
                "smithers-cloud": "smithers-cloud";
            }>;
            number: z.ZodNumber;
            url: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        registrationId: z.ZodOptional<z.ZodString>;
        sourceRevision: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    receipt: z.ZodOptional<z.ZodObject<{
        requestId: z.ZodString;
        runId: z.ZodOptional<z.ZodString>;
        jobRunId: z.ZodOptional<z.ZodString>;
        revision: z.ZodNumber;
        operation: z.ZodEnum<{
            apply: "apply";
            evaluate: "evaluate";
            inspect: "inspect";
            pause: "pause";
            run: "run";
            trial: "trial";
        }>;
        phase: z.ZodEnum<{
            completed: "completed";
            failed: "failed";
            queued: "queued";
            running: "running";
            stopped: "stopped";
            waiting: "waiting";
        }>;
        digest: z.ZodString;
        updatedAt: z.ZodNumber;
        results: z.ZodArray<z.ZodObject<{
            caseId: z.ZodString;
            status: z.ZodEnum<{
                error: "error";
                failed: "failed";
                passed: "passed";
                review: "review";
            }>;
            observed: z.ZodString;
            evidence: z.ZodArray<z.ZodString>;
            executionId: z.ZodString;
        }, z.core.$strip>>;
        evidence: z.ZodArray<z.ZodString>;
        error: z.ZodOptional<z.ZodString>;
        observation: z.ZodOptional<z.ZodObject<{
            state: z.ZodEnum<{
                blocked: "blocked";
                failed: "failed";
            }>;
            code: z.ZodEnum<{
                runtime_unavailable: "runtime_unavailable";
                runtime_unrecoverable: "runtime_unrecoverable";
            }>;
            observedAt: z.ZodNumber;
        }, z.core.$strip>>;
        trialIssue: z.ZodOptional<z.ZodObject<{
            source: z.ZodEnum<{
                github: "github";
                "smithers-cloud": "smithers-cloud";
            }>;
            number: z.ZodNumber;
            url: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        registrationId: z.ZodOptional<z.ZodString>;
        sourceRevision: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    previousReceipts: z.ZodDefault<z.ZodArray<z.ZodObject<{
        requestId: z.ZodString;
        runId: z.ZodOptional<z.ZodString>;
        jobRunId: z.ZodOptional<z.ZodString>;
        revision: z.ZodNumber;
        operation: z.ZodEnum<{
            apply: "apply";
            evaluate: "evaluate";
            inspect: "inspect";
            pause: "pause";
            run: "run";
            trial: "trial";
        }>;
        phase: z.ZodEnum<{
            completed: "completed";
            failed: "failed";
            queued: "queued";
            running: "running";
            stopped: "stopped";
            waiting: "waiting";
        }>;
        digest: z.ZodString;
        updatedAt: z.ZodNumber;
        results: z.ZodArray<z.ZodObject<{
            caseId: z.ZodString;
            status: z.ZodEnum<{
                error: "error";
                failed: "failed";
                passed: "passed";
                review: "review";
            }>;
            observed: z.ZodString;
            evidence: z.ZodArray<z.ZodString>;
            executionId: z.ZodString;
        }, z.core.$strip>>;
        evidence: z.ZodArray<z.ZodString>;
        error: z.ZodOptional<z.ZodString>;
        observation: z.ZodOptional<z.ZodObject<{
            state: z.ZodEnum<{
                blocked: "blocked";
                failed: "failed";
            }>;
            code: z.ZodEnum<{
                runtime_unavailable: "runtime_unavailable";
                runtime_unrecoverable: "runtime_unrecoverable";
            }>;
            observedAt: z.ZodNumber;
        }, z.core.$strip>>;
        trialIssue: z.ZodOptional<z.ZodObject<{
            source: z.ZodEnum<{
                github: "github";
                "smithers-cloud": "smithers-cloud";
            }>;
            number: z.ZodNumber;
            url: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        registrationId: z.ZodOptional<z.ZodString>;
        sourceRevision: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    active: z.ZodOptional<z.ZodObject<{
        revision: z.ZodNumber;
        digest: z.ZodString;
        registrationId: z.ZodString;
        sourceRevision: z.ZodString;
        enabled: z.ZodBoolean;
        owned: z.ZodOptional<z.ZodBoolean>;
        draft: z.ZodOptional<z.ZodObject<{
            steps: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                mode: z.ZodEnum<{
                    approved: "approved";
                    automatic: "automatic";
                    manual: "manual";
                    off: "off";
                }>;
                prompt: z.ZodString;
            }, z.core.$strip>>;
            checks: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                kind: z.ZodEnum<{
                    ai: "ai";
                    command: "command";
                }>;
                rule: z.ZodString;
                paths: z.ZodArray<z.ZodString>;
                policy: z.ZodEnum<{
                    report: "report";
                    required: "required";
                }>;
            }, z.core.$strip>>;
            cases: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                input: z.ZodString;
                expected: z.ZodString;
                source: z.ZodOptional<z.ZodString>;
                edited: z.ZodOptional<z.ZodBoolean>;
                required: z.ZodBoolean;
            }, z.core.$strip>>;
            replies: z.ZodEnum<{
                automatic: "automatic";
                draft: "draft";
            }>;
            landing: z.ZodEnum<{
                ask: "ask";
                checks: "checks";
            }>;
            scope: z.ZodEnum<{
                future: "future";
                label: "label";
            }>;
            label: z.ZodString;
            schedule: z.ZodString;
            choreEvent: z.ZodDefault<z.ZodEnum<{
                labeled: "labeled";
                none: "none";
                push: "push";
            }>>;
            budgetMinutes: z.ZodNumber;
            connectIssues: z.ZodBoolean;
            trialTitle: z.ZodString;
            trialBody: z.ZodString;
        }, z.core.$strip>>;
        schedule: z.ZodOptional<z.ZodObject<{
            expression: z.ZodString;
            nextFireAt: z.ZodISODateTime;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    recovery: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        baseRevision: z.ZodNumber;
        baseDigest: z.ZodString;
        adoptDraft: z.ZodOptional<z.ZodBoolean>;
        state: z.ZodEnum<{
            completed: "completed";
            failed: "failed";
            requested: "requested";
        }>;
        registrationState: z.ZodEnum<{
            known: "known";
            unavailable: "unavailable";
            unknown: "unknown";
        }>;
        error: z.ZodOptional<z.ZodString>;
        trialRegistration: z.ZodOptional<z.ZodObject<{
            registrationId: z.ZodString;
            workspaceId: z.ZodString;
            revision: z.ZodNumber;
            digest: z.ZodString;
            sourceRevision: z.ZodString;
            enabled: z.ZodBoolean;
            owned: z.ZodBoolean;
            draft: z.ZodObject<{
                steps: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodString;
                    mode: z.ZodEnum<{
                        approved: "approved";
                        automatic: "automatic";
                        manual: "manual";
                        off: "off";
                    }>;
                    prompt: z.ZodString;
                }, z.core.$strip>>;
                checks: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodString;
                    kind: z.ZodEnum<{
                        ai: "ai";
                        command: "command";
                    }>;
                    rule: z.ZodString;
                    paths: z.ZodArray<z.ZodString>;
                    policy: z.ZodEnum<{
                        report: "report";
                        required: "required";
                    }>;
                }, z.core.$strip>>;
                cases: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodString;
                    input: z.ZodString;
                    expected: z.ZodString;
                    source: z.ZodOptional<z.ZodString>;
                    edited: z.ZodOptional<z.ZodBoolean>;
                    required: z.ZodBoolean;
                }, z.core.$strip>>;
                replies: z.ZodEnum<{
                    automatic: "automatic";
                    draft: "draft";
                }>;
                landing: z.ZodEnum<{
                    ask: "ask";
                    checks: "checks";
                }>;
                scope: z.ZodEnum<{
                    future: "future";
                    label: "label";
                }>;
                label: z.ZodString;
                schedule: z.ZodString;
                choreEvent: z.ZodDefault<z.ZodEnum<{
                    labeled: "labeled";
                    none: "none";
                    push: "push";
                }>>;
                budgetMinutes: z.ZodNumber;
                connectIssues: z.ZodBoolean;
                trialTitle: z.ZodString;
                trialBody: z.ZodString;
            }, z.core.$strip>;
            schedule: z.ZodOptional<z.ZodObject<{
                expression: z.ZodString;
                nextFireAt: z.ZodISODateTime;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * Durable setup state retained inside a card and checked by the host.
 *
 * @since 1.0.0
 * @category models
 */
export type RepositorySetup = z.infer<typeof RepositorySetupSchema>;
/**
 * Opinionated initial draft; every job is inactive until tested and applied.
 *
 * @since 1.0.0
 * @category conversions
 */
export declare function initialSetup(repo: string, job: RepositoryJob, owner: string | null): RepositorySetup;
/**
 * The configuration a registration runs. The trial's own test request is the maintainer's input to one trial run,
 * so filling it neither advances the candidate nor stales the evals and the trial that prove the candidate.
 *
 * @since 1.0.0
 * @category conversions
 */
export declare function setupConfiguration<Draft extends Pick<SetupDraft, "trialTitle" | "trialBody">>(draft: Draft): Omit<Draft, "trialTitle" | "trialBody">;
/**
 * A stable candidate identity used to reject stale results. A chore event of "none" leaves the hashed draft, so a
 * candidate stored, registered or retained before the field existed keeps its digest.
 *
 * @since 1.0.0
 * @category conversions
 */
export declare function setupCandidate(setup: Pick<RepositorySetup, "repo" | "job" | "revision" | "draft">): string;
/**
 * Whether a digest a registration row, a stored request or a dispatched job carries names this candidate. The
 * identity written before the trial's own test request left the candidate hashed that request too, and nothing
 * recomputes a stored digest, so both identities name one registration and a job registered then keeps running.
 * That older identity is accepted until a migration rewrites every stored registry digest (added 2026-09-18);
 * it may be dropped in the same change that rewrites them, and not before.
 *
 * @since 1.0.0
 * @category conversions
 */
export declare function storedSetupCandidate(setup: Pick<RepositorySetup, "repo" | "job" | "revision" | "draft">, digest: string): boolean;
/**
 * The request carries editable input only, never claimed evaluation or activation proof.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupStartSchema: z.ZodObject<{
    requestId: z.ZodString;
    repo: z.ZodString;
    job: z.ZodEnum<{
        chores: "chores";
        ci: "ci";
        feature: "feature";
        issues: "issues";
        review: "review";
    }>;
    revision: z.ZodNumber;
    digest: z.ZodString;
    draft: z.ZodObject<{
        steps: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            mode: z.ZodEnum<{
                approved: "approved";
                automatic: "automatic";
                manual: "manual";
                off: "off";
            }>;
            prompt: z.ZodString;
        }, z.core.$strip>>;
        checks: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            kind: z.ZodEnum<{
                ai: "ai";
                command: "command";
            }>;
            rule: z.ZodString;
            paths: z.ZodArray<z.ZodString>;
            policy: z.ZodEnum<{
                report: "report";
                required: "required";
            }>;
        }, z.core.$strip>>;
        cases: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            input: z.ZodString;
            expected: z.ZodString;
            source: z.ZodOptional<z.ZodString>;
            edited: z.ZodOptional<z.ZodBoolean>;
            required: z.ZodBoolean;
        }, z.core.$strip>>;
        replies: z.ZodEnum<{
            automatic: "automatic";
            draft: "draft";
        }>;
        landing: z.ZodEnum<{
            ask: "ask";
            checks: "checks";
        }>;
        scope: z.ZodEnum<{
            future: "future";
            label: "label";
        }>;
        label: z.ZodString;
        schedule: z.ZodString;
        choreEvent: z.ZodDefault<z.ZodEnum<{
            labeled: "labeled";
            none: "none";
            push: "push";
        }>>;
        budgetMinutes: z.ZodNumber;
        connectIssues: z.ZodBoolean;
        trialTitle: z.ZodString;
        trialBody: z.ZodString;
    }, z.core.$strip>;
    workspaceId: z.ZodOptional<z.ZodString>;
    manual: z.ZodOptional<z.ZodObject<{
        stepId: z.ZodString;
        prompt: z.ZodString;
        subject: z.ZodOptional<z.ZodObject<{
            source: z.ZodEnum<{
                github: "github";
                "smithers-cloud": "smithers-cloud";
            }>;
            kind: z.ZodEnum<{
                issue: "issue";
                pr: "pr";
            }>;
            number: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * Durable modern-host entry input.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupHostInputSchema: z.ZodObject<{
    requestId: z.ZodString;
    repo: z.ZodString;
    job: z.ZodEnum<{
        chores: "chores";
        ci: "ci";
        feature: "feature";
        issues: "issues";
        review: "review";
    }>;
    revision: z.ZodNumber;
    digest: z.ZodString;
    draft: z.ZodObject<{
        steps: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            mode: z.ZodEnum<{
                approved: "approved";
                automatic: "automatic";
                manual: "manual";
                off: "off";
            }>;
            prompt: z.ZodString;
        }, z.core.$strip>>;
        checks: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            kind: z.ZodEnum<{
                ai: "ai";
                command: "command";
            }>;
            rule: z.ZodString;
            paths: z.ZodArray<z.ZodString>;
            policy: z.ZodEnum<{
                report: "report";
                required: "required";
            }>;
        }, z.core.$strip>>;
        cases: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            input: z.ZodString;
            expected: z.ZodString;
            source: z.ZodOptional<z.ZodString>;
            edited: z.ZodOptional<z.ZodBoolean>;
            required: z.ZodBoolean;
        }, z.core.$strip>>;
        replies: z.ZodEnum<{
            automatic: "automatic";
            draft: "draft";
        }>;
        landing: z.ZodEnum<{
            ask: "ask";
            checks: "checks";
        }>;
        scope: z.ZodEnum<{
            future: "future";
            label: "label";
        }>;
        label: z.ZodString;
        schedule: z.ZodString;
        choreEvent: z.ZodDefault<z.ZodEnum<{
            labeled: "labeled";
            none: "none";
            push: "push";
        }>>;
        budgetMinutes: z.ZodNumber;
        connectIssues: z.ZodBoolean;
        trialTitle: z.ZodString;
        trialBody: z.ZodString;
    }, z.core.$strip>;
    workspaceId: z.ZodOptional<z.ZodString>;
    manual: z.ZodOptional<z.ZodObject<{
        stepId: z.ZodString;
        prompt: z.ZodString;
        subject: z.ZodOptional<z.ZodObject<{
            source: z.ZodEnum<{
                github: "github";
                "smithers-cloud": "smithers-cloud";
            }>;
            kind: z.ZodEnum<{
                issue: "issue";
                pr: "pr";
            }>;
            number: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    operation: z.ZodEnum<{
        apply: "apply";
        evaluate: "evaluate";
        inspect: "inspect";
        pause: "pause";
        run: "run";
        trial: "trial";
    }>;
}, z.core.$strip>;
/**
 * Input shared by the app, Worker, and installed repository/setup flow.
 *
 * @since 1.0.0
 * @category models
 */
export type SetupHostInput = z.infer<typeof SetupHostInputSchema>;
/**
 * Repair historical progress only from an available receipt for the same request.
 *
 * @since 1.0.0
 * @category conversions
 */
export declare function reconcileSetupHistory(setup: RepositorySetup): RepositorySetup;
/**
 * Preserve a displaced receipt without making it current execution evidence.
 *
 * @since 1.0.0
 * @category conversions
 */
export declare function archiveReplacedSetupReceipt(setup: RepositorySetup, replacement: SetupReceipt): RepositorySetup;
/**
 * Change the candidate without changing the previously activated version.
 *
 * @since 1.0.0
 * @category conversions
 */
export declare function editSetup(setup: RepositorySetup, draft: SetupDraft): RepositorySetup;
/**
 * Return the candidate to the enabled registration's own recorded configuration. Its revision comes back with its
 * draft, because the revision is part of the candidate digest the run gate compares.
 *
 * @since 1.0.0
 * @category conversions
 */
export declare function discardSetupDraft(setup: RepositorySetup): RepositorySetup;
/**
 * The host acknowledges an inspection or a durable execution request.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupOperationResponseSchema: z.ZodObject<{
    requestId: z.ZodString;
    revision: z.ZodNumber;
    digest: z.ZodString;
    workspaceId: z.ZodOptional<z.ZodString>;
    receipt: z.ZodOptional<z.ZodObject<{
        requestId: z.ZodString;
        runId: z.ZodOptional<z.ZodString>;
        jobRunId: z.ZodOptional<z.ZodString>;
        revision: z.ZodNumber;
        operation: z.ZodEnum<{
            apply: "apply";
            evaluate: "evaluate";
            inspect: "inspect";
            pause: "pause";
            run: "run";
            trial: "trial";
        }>;
        phase: z.ZodEnum<{
            completed: "completed";
            failed: "failed";
            queued: "queued";
            running: "running";
            stopped: "stopped";
            waiting: "waiting";
        }>;
        digest: z.ZodString;
        updatedAt: z.ZodNumber;
        results: z.ZodArray<z.ZodObject<{
            caseId: z.ZodString;
            status: z.ZodEnum<{
                error: "error";
                failed: "failed";
                passed: "passed";
                review: "review";
            }>;
            observed: z.ZodString;
            evidence: z.ZodArray<z.ZodString>;
            executionId: z.ZodString;
        }, z.core.$strip>>;
        evidence: z.ZodArray<z.ZodString>;
        error: z.ZodOptional<z.ZodString>;
        observation: z.ZodOptional<z.ZodObject<{
            state: z.ZodEnum<{
                blocked: "blocked";
                failed: "failed";
            }>;
            code: z.ZodEnum<{
                runtime_unavailable: "runtime_unavailable";
                runtime_unrecoverable: "runtime_unrecoverable";
            }>;
            observedAt: z.ZodNumber;
        }, z.core.$strip>>;
        trialIssue: z.ZodOptional<z.ZodObject<{
            source: z.ZodEnum<{
                github: "github";
                "smithers-cloud": "smithers-cloud";
            }>;
            number: z.ZodNumber;
            url: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        registrationId: z.ZodOptional<z.ZodString>;
        sourceRevision: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    inspection: z.ZodOptional<z.ZodObject<{
        sources: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            status: z.ZodEnum<{
                failed: "failed";
                missing: "missing";
                read: "read";
            }>;
            summary: z.ZodString;
            revision: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        suggestedDraft: z.ZodObject<{
            steps: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                mode: z.ZodEnum<{
                    approved: "approved";
                    automatic: "automatic";
                    manual: "manual";
                    off: "off";
                }>;
                prompt: z.ZodString;
            }, z.core.$strip>>;
            checks: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                kind: z.ZodEnum<{
                    ai: "ai";
                    command: "command";
                }>;
                rule: z.ZodString;
                paths: z.ZodArray<z.ZodString>;
                policy: z.ZodEnum<{
                    report: "report";
                    required: "required";
                }>;
            }, z.core.$strip>>;
            cases: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                input: z.ZodString;
                expected: z.ZodString;
                source: z.ZodOptional<z.ZodString>;
                edited: z.ZodOptional<z.ZodBoolean>;
                required: z.ZodBoolean;
            }, z.core.$strip>>;
            replies: z.ZodEnum<{
                automatic: "automatic";
                draft: "draft";
            }>;
            landing: z.ZodEnum<{
                ask: "ask";
                checks: "checks";
            }>;
            scope: z.ZodEnum<{
                future: "future";
                label: "label";
            }>;
            label: z.ZodString;
            schedule: z.ZodString;
            choreEvent: z.ZodDefault<z.ZodEnum<{
                labeled: "labeled";
                none: "none";
                push: "push";
            }>>;
            budgetMinutes: z.ZodNumber;
            connectIssues: z.ZodBoolean;
            trialTitle: z.ZodString;
            trialBody: z.ZodString;
        }, z.core.$strip>;
        inspectedAt: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * Read-only recovery cannot manufacture evals or authorize host execution.
 *
 * @since 1.0.0
 * @category schemas
 */
export declare const SetupRecoveryResponseSchema: z.ZodObject<{
    owner: z.ZodString;
    repo: z.ZodString;
    job: z.ZodEnum<{
        chores: "chores";
        ci: "ci";
        feature: "feature";
        issues: "issues";
        review: "review";
    }>;
    registration: z.ZodDiscriminatedUnion<[z.ZodObject<{
        state: z.ZodLiteral<"known">;
        active: z.ZodOptional<z.ZodObject<{
            registrationId: z.ZodString;
            workspaceId: z.ZodString;
            revision: z.ZodNumber;
            digest: z.ZodString;
            sourceRevision: z.ZodString;
            enabled: z.ZodBoolean;
            owned: z.ZodBoolean;
            draft: z.ZodObject<{
                steps: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodString;
                    mode: z.ZodEnum<{
                        approved: "approved";
                        automatic: "automatic";
                        manual: "manual";
                        off: "off";
                    }>;
                    prompt: z.ZodString;
                }, z.core.$strip>>;
                checks: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodString;
                    kind: z.ZodEnum<{
                        ai: "ai";
                        command: "command";
                    }>;
                    rule: z.ZodString;
                    paths: z.ZodArray<z.ZodString>;
                    policy: z.ZodEnum<{
                        report: "report";
                        required: "required";
                    }>;
                }, z.core.$strip>>;
                cases: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodString;
                    input: z.ZodString;
                    expected: z.ZodString;
                    source: z.ZodOptional<z.ZodString>;
                    edited: z.ZodOptional<z.ZodBoolean>;
                    required: z.ZodBoolean;
                }, z.core.$strip>>;
                replies: z.ZodEnum<{
                    automatic: "automatic";
                    draft: "draft";
                }>;
                landing: z.ZodEnum<{
                    ask: "ask";
                    checks: "checks";
                }>;
                scope: z.ZodEnum<{
                    future: "future";
                    label: "label";
                }>;
                label: z.ZodString;
                schedule: z.ZodString;
                choreEvent: z.ZodDefault<z.ZodEnum<{
                    labeled: "labeled";
                    none: "none";
                    push: "push";
                }>>;
                budgetMinutes: z.ZodNumber;
                connectIssues: z.ZodBoolean;
                trialTitle: z.ZodString;
                trialBody: z.ZodString;
            }, z.core.$strip>;
            schedule: z.ZodOptional<z.ZodObject<{
                expression: z.ZodString;
                nextFireAt: z.ZodISODateTime;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        trial: z.ZodOptional<z.ZodObject<{
            registrationId: z.ZodString;
            workspaceId: z.ZodString;
            revision: z.ZodNumber;
            digest: z.ZodString;
            sourceRevision: z.ZodString;
            enabled: z.ZodBoolean;
            owned: z.ZodBoolean;
            draft: z.ZodObject<{
                steps: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodString;
                    mode: z.ZodEnum<{
                        approved: "approved";
                        automatic: "automatic";
                        manual: "manual";
                        off: "off";
                    }>;
                    prompt: z.ZodString;
                }, z.core.$strip>>;
                checks: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodString;
                    kind: z.ZodEnum<{
                        ai: "ai";
                        command: "command";
                    }>;
                    rule: z.ZodString;
                    paths: z.ZodArray<z.ZodString>;
                    policy: z.ZodEnum<{
                        report: "report";
                        required: "required";
                    }>;
                }, z.core.$strip>>;
                cases: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodString;
                    input: z.ZodString;
                    expected: z.ZodString;
                    source: z.ZodOptional<z.ZodString>;
                    edited: z.ZodOptional<z.ZodBoolean>;
                    required: z.ZodBoolean;
                }, z.core.$strip>>;
                replies: z.ZodEnum<{
                    automatic: "automatic";
                    draft: "draft";
                }>;
                landing: z.ZodEnum<{
                    ask: "ask";
                    checks: "checks";
                }>;
                scope: z.ZodEnum<{
                    future: "future";
                    label: "label";
                }>;
                label: z.ZodString;
                schedule: z.ZodString;
                choreEvent: z.ZodDefault<z.ZodEnum<{
                    labeled: "labeled";
                    none: "none";
                    push: "push";
                }>>;
                budgetMinutes: z.ZodNumber;
                connectIssues: z.ZodBoolean;
                trialTitle: z.ZodString;
                trialBody: z.ZodString;
            }, z.core.$strip>;
            schedule: z.ZodOptional<z.ZodObject<{
                expression: z.ZodString;
                nextFireAt: z.ZodISODateTime;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        state: z.ZodLiteral<"unavailable">;
        error: z.ZodString;
    }, z.core.$strip>], "state">;
    setup: z.ZodDiscriminatedUnion<[z.ZodObject<{
        state: z.ZodLiteral<"found">;
        input: z.ZodObject<{
            requestId: z.ZodString;
            repo: z.ZodString;
            job: z.ZodEnum<{
                chores: "chores";
                ci: "ci";
                feature: "feature";
                issues: "issues";
                review: "review";
            }>;
            revision: z.ZodNumber;
            digest: z.ZodString;
            draft: z.ZodObject<{
                steps: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodString;
                    mode: z.ZodEnum<{
                        approved: "approved";
                        automatic: "automatic";
                        manual: "manual";
                        off: "off";
                    }>;
                    prompt: z.ZodString;
                }, z.core.$strip>>;
                checks: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodString;
                    kind: z.ZodEnum<{
                        ai: "ai";
                        command: "command";
                    }>;
                    rule: z.ZodString;
                    paths: z.ZodArray<z.ZodString>;
                    policy: z.ZodEnum<{
                        report: "report";
                        required: "required";
                    }>;
                }, z.core.$strip>>;
                cases: z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    name: z.ZodString;
                    input: z.ZodString;
                    expected: z.ZodString;
                    source: z.ZodOptional<z.ZodString>;
                    edited: z.ZodOptional<z.ZodBoolean>;
                    required: z.ZodBoolean;
                }, z.core.$strip>>;
                replies: z.ZodEnum<{
                    automatic: "automatic";
                    draft: "draft";
                }>;
                landing: z.ZodEnum<{
                    ask: "ask";
                    checks: "checks";
                }>;
                scope: z.ZodEnum<{
                    future: "future";
                    label: "label";
                }>;
                label: z.ZodString;
                schedule: z.ZodString;
                choreEvent: z.ZodDefault<z.ZodEnum<{
                    labeled: "labeled";
                    none: "none";
                    push: "push";
                }>>;
                budgetMinutes: z.ZodNumber;
                connectIssues: z.ZodBoolean;
                trialTitle: z.ZodString;
                trialBody: z.ZodString;
            }, z.core.$strip>;
            workspaceId: z.ZodOptional<z.ZodString>;
            manual: z.ZodOptional<z.ZodObject<{
                stepId: z.ZodString;
                prompt: z.ZodString;
                subject: z.ZodOptional<z.ZodObject<{
                    source: z.ZodEnum<{
                        github: "github";
                        "smithers-cloud": "smithers-cloud";
                    }>;
                    kind: z.ZodEnum<{
                        issue: "issue";
                        pr: "pr";
                    }>;
                    number: z.ZodNumber;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            operation: z.ZodEnum<{
                apply: "apply";
                evaluate: "evaluate";
                inspect: "inspect";
                pause: "pause";
                run: "run";
                trial: "trial";
            }>;
        }, z.core.$strip>;
        result: z.ZodObject<{
            requestId: z.ZodString;
            revision: z.ZodNumber;
            digest: z.ZodString;
            workspaceId: z.ZodOptional<z.ZodString>;
            receipt: z.ZodOptional<z.ZodObject<{
                requestId: z.ZodString;
                runId: z.ZodOptional<z.ZodString>;
                jobRunId: z.ZodOptional<z.ZodString>;
                revision: z.ZodNumber;
                operation: z.ZodEnum<{
                    apply: "apply";
                    evaluate: "evaluate";
                    inspect: "inspect";
                    pause: "pause";
                    run: "run";
                    trial: "trial";
                }>;
                phase: z.ZodEnum<{
                    completed: "completed";
                    failed: "failed";
                    queued: "queued";
                    running: "running";
                    stopped: "stopped";
                    waiting: "waiting";
                }>;
                digest: z.ZodString;
                updatedAt: z.ZodNumber;
                results: z.ZodArray<z.ZodObject<{
                    caseId: z.ZodString;
                    status: z.ZodEnum<{
                        error: "error";
                        failed: "failed";
                        passed: "passed";
                        review: "review";
                    }>;
                    observed: z.ZodString;
                    evidence: z.ZodArray<z.ZodString>;
                    executionId: z.ZodString;
                }, z.core.$strip>>;
                evidence: z.ZodArray<z.ZodString>;
                error: z.ZodOptional<z.ZodString>;
                observation: z.ZodOptional<z.ZodObject<{
                    state: z.ZodEnum<{
                        blocked: "blocked";
                        failed: "failed";
                    }>;
                    code: z.ZodEnum<{
                        runtime_unavailable: "runtime_unavailable";
                        runtime_unrecoverable: "runtime_unrecoverable";
                    }>;
                    observedAt: z.ZodNumber;
                }, z.core.$strip>>;
                trialIssue: z.ZodOptional<z.ZodObject<{
                    source: z.ZodEnum<{
                        github: "github";
                        "smithers-cloud": "smithers-cloud";
                    }>;
                    number: z.ZodNumber;
                    url: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>;
                registrationId: z.ZodOptional<z.ZodString>;
                sourceRevision: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            inspection: z.ZodOptional<z.ZodObject<{
                sources: z.ZodArray<z.ZodObject<{
                    path: z.ZodString;
                    status: z.ZodEnum<{
                        failed: "failed";
                        missing: "missing";
                        read: "read";
                    }>;
                    summary: z.ZodString;
                    revision: z.ZodOptional<z.ZodString>;
                }, z.core.$strip>>;
                suggestedDraft: z.ZodObject<{
                    steps: z.ZodArray<z.ZodObject<{
                        id: z.ZodString;
                        name: z.ZodString;
                        mode: z.ZodEnum<{
                            approved: "approved";
                            automatic: "automatic";
                            manual: "manual";
                            off: "off";
                        }>;
                        prompt: z.ZodString;
                    }, z.core.$strip>>;
                    checks: z.ZodArray<z.ZodObject<{
                        id: z.ZodString;
                        name: z.ZodString;
                        kind: z.ZodEnum<{
                            ai: "ai";
                            command: "command";
                        }>;
                        rule: z.ZodString;
                        paths: z.ZodArray<z.ZodString>;
                        policy: z.ZodEnum<{
                            report: "report";
                            required: "required";
                        }>;
                    }, z.core.$strip>>;
                    cases: z.ZodArray<z.ZodObject<{
                        id: z.ZodString;
                        name: z.ZodString;
                        input: z.ZodString;
                        expected: z.ZodString;
                        source: z.ZodOptional<z.ZodString>;
                        edited: z.ZodOptional<z.ZodBoolean>;
                        required: z.ZodBoolean;
                    }, z.core.$strip>>;
                    replies: z.ZodEnum<{
                        automatic: "automatic";
                        draft: "draft";
                    }>;
                    landing: z.ZodEnum<{
                        ask: "ask";
                        checks: "checks";
                    }>;
                    scope: z.ZodEnum<{
                        future: "future";
                        label: "label";
                    }>;
                    label: z.ZodString;
                    schedule: z.ZodString;
                    choreEvent: z.ZodDefault<z.ZodEnum<{
                        labeled: "labeled";
                        none: "none";
                        push: "push";
                    }>>;
                    budgetMinutes: z.ZodNumber;
                    connectIssues: z.ZodBoolean;
                    trialTitle: z.ZodString;
                    trialBody: z.ZodString;
                }, z.core.$strip>;
                inspectedAt: z.ZodNumber;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        observationError: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        state: z.ZodLiteral<"none">;
    }, z.core.$strip>, z.ZodObject<{
        state: z.ZodLiteral<"unavailable">;
        error: z.ZodString;
    }, z.core.$strip>], "state">;
}, z.core.$strip>;
/**
 * Independent policy and stored-request results, including partial failure.
 *
 * @since 1.0.0
 * @category models
 */
export type SetupRecoveryResponse = z.infer<typeof SetupRecoveryResponseSchema>;
/**
 * What a registration's own scope refuses: a chore that fires on a schedule or event but runs no step reports
 * skipped forever, a label-scoped candidate with no chosen label matches every labeled issue, and a padded label
 * matches none, since the registry compares label names exactly.
 *
 * @since 1.0.0
 * @category conversions
 */
export declare function registrationScopeProblems(setup: {
    job: RepositoryJob;
    draft: Pick<SetupDraft, "schedule" | "choreEvent" | "scope" | "label"> & {
        steps: ReadonlyArray<Pick<SetupDraft["steps"][number], "mode">>;
    };
}): string[];
/**
 * Whether the candidate has direct, current evidence sufficient to request activation.
 *
 * @since 1.0.0
 * @category conversions
 */
export declare function setupActivationProblems(setup: RepositorySetup): string[];
