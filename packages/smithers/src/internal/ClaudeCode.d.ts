/**
 * A Claude subscription seat: the user's own signed-in Claude Code, driven
 * through the Claude Agent SDK, as a {@link Model.Model}.
 *
 * Anthropic lets a Claude subscription sign only Claude Code's own requests,
 * and forbids a third party to collect, store or relay its credentials. So
 * this process holds no Claude credential at all: it starts the `claude`
 * binary, and that binary signs every call. The seat exists only where no
 * `ANTHROPIC_API_KEY` is set (`Providers.claudeCode`); a key keeps Claude
 * seats on the Messages API.
 *
 * Each conversation (`request.cacheKey`) is one long-lived Claude Code session,
 * locked down so Claude Code adds as little as it can: no tools, no MCP
 * servers, settings, plugins or skills of the user's, and the request's system
 * prompt in place of Claude Code's. A frame is one turn. Claude answers in
 * text, a fenced cell like any other seat's reply, and the text passes through
 * unchanged. The next request extends the last by that reply and new messages
 * (the cell's result, the person's steering), and those messages are the next
 * user turn, so Claude reads them with the person's authority, never as tool
 * output. A request identical to the last one is a retry and gets the
 * recorded answer without advancing Claude. Any other request (another
 * process, a compacted window) starts a fresh session with the history
 * flattened into its first message.
 *
 * A request without a `cacheKey` belongs to no conversation, like a
 * compaction summary, and is answered by a session of its own that closes
 * after one turn.
 *
 * Of the generation parameters only `reasoningEffort` reaches Claude Code, as
 * its `effort`. It has no setting for the others, and refusing them would
 * refuse every flow that states one for an API seat, so they are ignored.
 * Provider-run tools and declared tools are refused: Claude Code runs none.
 *
 * @since 1.0.0
 * @private
 */
import * as Sdk from "@anthropic-ai/claude-agent-sdk";
import type * as FlowEngineLike from "@smthrs/agent/FlowEngineLike";
import * as Model from "@smthrs/model/Model";
/**
 * The part of an SDK query this seat drives.
 *
 * @since 1.0.0
 * @private
 */
export interface Query extends AsyncIterable<Sdk.SDKMessage> {
    readonly interrupt: () => Promise<unknown>;
    readonly close: () => void;
}
/**
 * Starts a Claude Code session: `Sdk.query`, or a test's fake.
 *
 * @since 1.0.0
 * @private
 */
export type Start = (input: {
    readonly prompt: string | AsyncIterable<Sdk.SDKUserMessage>;
    readonly options: Sdk.Options;
}) => Query;
/**
 * @since 1.0.0
 * @private
 */
export interface Options {
    /** The model Claude Code runs. */
    readonly model: string;
    /** The installed `claude` binary. */
    readonly executable: string;
    /** The host environment. Claude Code gets it with API credentials and injected Node settings withheld. */
    readonly environment: Readonly<Record<string, string | undefined>>;
    /** Claude Code's working directory, the system temporary directory by default: it never works in a repository. */
    readonly cwd?: string | undefined;
    /**
     * Keeps each session's transcript on disk, so `claude --resume <sessionId>`
     * can open it (the `sessionId` on the `settle` event). Off by default: an
     * unattended seat leaves nothing behind.
     */
    readonly hijackable?: boolean | undefined;
    readonly start?: Start | undefined;
    /** How long an idle session stays open, one hour by default. */
    readonly idleMillis?: number | undefined;
    /** How long a close waits for Claude Code to acknowledge the interrupt before closing anyway. */
    readonly interruptMillis?: number | undefined;
}
/**
 * The claude-code seat's {@link Model.Model}. Sessions live in the returned
 * model, one per conversation, and stay open between turns. `close` ends every
 * one of them; the host calls it on shutdown, since an open session's Claude
 * Code process keeps the host process alive.
 *
 * @category constructors
 * @since 1.0.0
 * @private
 */
export declare const make: (options: Options) => Model.Model & {
    readonly close: () => void;
};
/**
 * The claude-code seat's sealed-step view of a request: the request itself,
 * canonical, since no wire body exists outside Claude Code.
 *
 * @category constructors
 * @since 1.0.0
 * @private
 */
export declare const route: (model: string) => FlowEngineLike.RouteResolver;
