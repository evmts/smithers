/**
 * Wiring Smithers into the agents an operator already runs.
 *
 * `smthrs mcp add` writes the stdio MCP server entry into an agent's own
 * configuration.
 *
 * rc.0 knows two agents, Claude Code and Codex, because those are the two the
 * release supports directly; every other 0.x target (Hermes, OpenClaw, Pi)
 * moved to the plugins repository with its adapter. Writing is always
 * additive and idempotent: an entry that is already correct is left alone, and
 * an agent whose configuration cannot be written gets the snippet printed
 * instead of a silent failure.
 *
 * @since 1.0.0
 */
/**
 * The MCP server name Smithers registers under.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const serverName = "smithers";
/**
 * A TOML basic string for a Codex configuration override.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const codexConfigString: (text: string) => string;
/**
 * The vendor environment with API credentials, workload identity and injected
 * Node settings excluded before their values are read.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const codexEnvironment: (source: Readonly<Record<string, string | undefined>>) => NodeJS.ProcessEnv;
/**
 * One agent this CLI can wire itself into.
 *
 * @category models
 * @since 1.0.0
 */
export interface Agent {
    readonly id: string;
    /** The agent's MCP server map, relative to the home directory. */
    readonly mcpConfig: ReadonlyArray<string>;
}
/**
 * The agents rc.0 wires.
 *
 * @category constants
 * @since 1.0.0
 */
export declare const agents: ReadonlyArray<Agent>;
/**
 * Finds one agent by id.
 *
 * @category getters
 * @since 1.0.0
 */
export declare const find: (id: string) => Agent | undefined;
/**
 * The launch command an agent should start the MCP server with.
 *
 * The current executable and entry are used verbatim rather than a package
 * runner: a checkout under development must register the CLI under edit, and
 * an installed CLI registers its own installed path. 0.x registered
 * `bunx smthrs --mcp`, which silently pointed every agent at the last
 * published build.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const launchCommand: (execPath?: string, entry?: string) => {
    readonly command: string;
    readonly args: ReadonlyArray<string>;
};
/**
 * What one wiring attempt did.
 *
 * @category models
 * @since 1.0.0
 */
export interface Wired {
    readonly agent: string;
    readonly path: string;
    readonly status: "written" | "unchanged" | "failed";
    readonly reason?: string | undefined;
}
/**
 * Registers the Smithers MCP server with one agent.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const addMcp: (agent: Agent, home?: string, environment?: NodeJS.ProcessEnv) => Wired;
/**
 * The manual instructions printed when automatic registration fails.
 *
 * The `--` separator matters: without it an agent's own argument parser reads
 * `--mcp` as one of its flags and rejects the registration.
 *
 * @category constructors
 * @since 1.0.0
 */
export declare const manualInstructions: (targets?: ReadonlyArray<string>) => string;
