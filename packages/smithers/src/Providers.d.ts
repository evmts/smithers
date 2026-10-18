/**
 * Which model seats this machine can run `smthrs suggest` on, and which one
 * it runs on.
 *
 * Detection is pure over an injected environment, home directory, and file
 * reader, so the whole matrix (a Codex session, an API-key login, an empty
 * key, an override) is a table of small cases rather than a fixture in
 * `$HOME`. The order of {@link order} is the documented seat order and the
 * only ranking there is: the first available entry is the seat, and nothing
 * here weighs one provider against another.
 *
 * Anthropic never appears. That provider does not support the use this verb
 * puts a model to, so an `anthropic:` override is refused rather than tried.
 *
 * The three OpenAI-compatible providers the CLI's resolver had no route for
 * (Moonshot, Gemini's compatibility layer, Cerebras) are described here too,
 * in {@link compatible}, and `NodeControl.seatResolver` builds their routes
 * from this table so the seat this verb chooses is a seat the launcher can
 * run.
 *
 * @since 1.0.0-rc.0
 */
import * as Environment from "./Environment.ts";
/**
 * The stable id of one candidate seat.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export type Candidate = "codex-subscription" | "kimi-k3" | "openai" | "gemini" | "openrouter" | "cerebras";
/**
 * The documented order the candidates are tried in.
 *
 * @category constants
 * @since 1.0.0-rc.0
 */
export declare const order: ReadonlyArray<Candidate>;
/**
 * What the scan found for one candidate.
 *
 * `environment` is what the seat resolver has to read on top of the process
 * environment to run `seat`: Codex detection supplies
 * `SMITHERS_OPENAI_AUTH=chatgpt`; every other candidate supplies no variables.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface Detection {
    readonly id: Candidate;
    readonly label: string;
    readonly seat: string;
    readonly available: boolean;
    readonly reason: string;
    readonly setupHint: string;
    readonly environment: Readonly<Record<string, string>>;
}
/**
 * The seat the verb runs on: a detection, or the operator's own override.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface Chosen {
    readonly seat: string;
    /** The candidate id, or `override` for a `--seat` value. */
    readonly source: Candidate | "override";
    readonly label: string;
    readonly environment: Readonly<Record<string, string>>;
}
/**
 * What detection reads from the host.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface Host {
    readonly environment: Environment.Source;
    readonly homeDirectory: string;
    /** The text of a file, or `undefined` when it cannot be read. */
    readonly readFile: (path: string) => string | undefined;
    /**
     * This machine's Claude Code login, usually {@link claudeCodeLogin}. Absent,
     * or answering `undefined`, means Claude Code is not installed.
     */
    readonly claudeCode?: (() => Promise<ClaudeCodeLogin | undefined> | ClaudeCodeLogin | undefined) | undefined;
}
/**
 * One OpenAI-compatible Chat Completions provider the resolver routes by
 * table: the origin, the exact path when the provider's differs from
 * `/v1/chat/completions`, and the key variables read in order.
 *
 * @category models
 * @since 1.0.0-rc.0
 */
export interface Compatible {
    readonly baseUrl: string;
    readonly path?: string | undefined;
    readonly variables: ReadonlyArray<string>;
}
/**
 * The OpenAI-compatible providers, by seat prefix.
 *
 * Gemini's compatibility layer lives under `/v1beta/openai`, so its path is
 * spelled in full rather than appended as `/v1/chat/completions`.
 *
 * @category constants
 * @since 1.0.0-rc.0
 */
export declare const compatible: Readonly<Record<string, Compatible>>;
/**
 * The first key variable of a compatible provider that is set and non-empty.
 *
 * @category getters
 * @since 1.0.0-rc.0
 */
export declare const compatibleKey: (provider: string, environment: Environment.Source) => {
    readonly variable: string;
    readonly key: string;
} | undefined;
/**
 * The model each candidate runs when nothing overrides it.
 *
 * @category constants
 * @since 1.0.0-rc.0
 */
export declare const defaultSeat: Readonly<Record<Candidate, string>>;
/**
 * The short seat names a flow, a role table or an operator may write instead
 * of `provider:modelId`. The prefix picks the credential: `openai:` seats run
 * on the Codex (ChatGPT) session or an OpenAI key, `anthropic:` seats on an
 * Anthropic key.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const seatAliases: Readonly<Record<string, string>>;
/**
 * Jev, the decision model. It answers typed classifier questions through the
 * host's `Evaluator` and writes no text, so it is never an agent seat.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const decisionSeat: {
    readonly alias: "jev";
    readonly modelId: "typesafe-ai/jev";
};
/**
 * The relative cost of one seat against the others, read off the provider's
 * list prices: `low`, `mid` or `high`.
 *
 * @category models
 * @since 1.0.0
 */
export type CostTier = "low" | "mid" | "high";
/**
 * What one seat is: the display label, one strength line, and the seat's
 * {@link CostTier}.
 *
 * @category models
 * @since 1.0.0
 */
export interface SeatDescription {
    readonly label: string;
    readonly strength: string;
    readonly cost: CostTier;
}
/**
 * The description of every seat an alias in {@link seatAliases} names, plus
 * the key-backed seats of {@link defaultSeat}, keyed by `provider:modelId`.
 * The tiers come from the committed rate
 * card (`packages/backend/modelprice/prices.go`): `low` under $1 per million
 * input tokens, `high` above $3, `mid` between; a seat with no committed
 * price (Kimi) is tiered from its provider's list price.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const seatDescriptions: Readonly<Record<string, SeatDescription>>;
/**
 * The {@link SeatDescription} of a seat: an alias, or a `provider:modelId`
 * the table names. `undefined` for a seat the table has not met.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const describeSeat: (seat: string) => SeatDescription | undefined;
/**
 * The `provider:modelId` an alias names, or the seat unchanged. Case and
 * surrounding space are ignored for aliases only.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const expandSeat: (seat: string) => string;
/**
 * True when a seat names Jev, bare or behind any provider prefix.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const isDecisionSeat: (seat: string) => boolean;
/**
 * Why a declared seat cannot run an agent turn, or `undefined` when it can be
 * resolved: an alias, or an explicit `provider:modelId`.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const seatRefusal: (seat: string) => string | undefined;
/**
 * Ordered starter credential variables and seats supported by the executor's provider routes.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const starterSeats: ReadonlyArray<readonly [variable: string, seat: string]>;
/**
 * One record per candidate, in {@link order}.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const detect: (host: Host) => ReadonlyArray<Detection>;
/**
 * What `claude auth status` says about this machine's Claude Code login, and
 * where the binary is. It is everything Smithers reads about a Claude login:
 * never a token or a credentials file, because Anthropic's terms let only
 * Claude Code hold those.
 *
 * @category models
 * @since 1.0.0
 */
export interface ClaudeCodeLogin {
    readonly executable: string;
    readonly loggedIn: boolean;
    /** `claude.ai` for `claude auth login`, `oauth_token` for `claude setup-token`, `api_key` for a key. */
    readonly authMethod: string;
    readonly subscriptionType?: string | undefined;
    /** Diagnostic from `claude auth status` when it printed no valid status. */
    readonly error?: string | undefined;
}
/**
 * The `claude` on `environment`'s `PATH` and what `claude auth status`
 * reports, or `undefined` when there is no `claude`.
 * It runs the binary, so it is the one impure reading a {@link Host} makes.
 *
 * In-flight and subscription statuses are shared per binary and login variables.
 * Other statuses expire after 30 seconds, so `claude auth login`
 * takes effect without a restart.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const claudeCodeLogin: (environment: Environment.Source) => Promise<ClaudeCodeLogin | undefined>;
/**
 * The OpenAI model an alias names, or the model unchanged.
 * @category getters
 * @since 1.0.0
 */
export declare const codexModel: (model: string) => string;
/**
 * The seats a Claude subscription serves through Claude Code, one per
 * Anthropic {@link seatAliases} entry: `claude-code:opus` runs what `opus`
 * names, on the user's own Claude Code.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const claudeCodeSeats: ReadonlyArray<string>;
/**
 * The model Claude Code runs for the model half of a `claude-code:` seat: the
 * Anthropic model an alias names, or the name unchanged.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const claudeCodeModel: (model: string) => string;
/**
 * Whether {@link claudeCodeSeats} run here: only on a Claude subscription,
 * signed in through Claude Code's own flow, and never beside
 * `ANTHROPIC_API_KEY`, which keeps Claude seats on the API.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const claudeCode: (host: Host) => Promise<{
    readonly available: boolean;
    readonly reason: string;
    readonly setupHint: string;
    readonly executable?: string | undefined;
}>;
declare const NoSeatError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "/suggest/NoSeatError";
} & Readonly<A>;
/**
 * No candidate is available. The message lists every seat looked for, why it
 * was not usable, and how to set it up.
 *
 * @category errors
 * @since 1.0.0-rc.0
 */
export declare class NoSeatError extends NoSeatError_base<{
    readonly detections: ReadonlyArray<Detection>;
    readonly message: string;
}> {
    constructor(detections: ReadonlyArray<Detection>);
}
/**
 * Why a `--seat` value is refused: `malformed` when it is not
 * `provider:model`, `anthropic` when it names the provider this verb never
 * uses.
 *
 * @category models
 * @since 1.0.0-rc.1
 */
export type SeatSyntaxReason = "malformed" | "anthropic";
declare const SeatSyntaxError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "/suggest/SeatSyntaxError";
} & Readonly<A>;
/**
 * A `--seat` value that is not `provider:model`, or names a provider this
 * verb never uses. `reason` says which.
 *
 * @category errors
 * @since 1.0.0-rc.0
 */
export declare class SeatSyntaxError extends SeatSyntaxError_base<{
    readonly seat: string;
    readonly reason: SeatSyntaxReason;
    readonly message: string;
}> {
    constructor(seat: string, reason: SeatSyntaxReason);
}
/**
 * The sentence printed when nothing is available.
 *
 * @category conversions
 * @since 1.0.0-rc.0
 */
export declare const noSeatMessage: (detections: ReadonlyArray<Detection>) => string;
/**
 * The first available detection, or the operator's override.
 *
 * @category constructors
 * @since 1.0.0-rc.0
 */
export declare const chooseSeat: (detections: ReadonlyArray<Detection>, override?: string | undefined) => Chosen | NoSeatError | SeatSyntaxError;
export {};
