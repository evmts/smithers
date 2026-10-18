/**
 * The instructions an agent profile runs with.
 *
 * A profile is the role's markdown flow, `.smithers/flows/<role>/flow.mdx`: the one
 * shape every flow has. Its frontmatter carries what the runtime reads
 * (`description`, `model`, `effort`, `capabilities`, `budget`, `flows`) and a
 * string `metadata` map with the role's display `name` and its `skills`, a
 * comma-separated list; the body is the charter. Skills are
 * `Skills/<name>/SKILL.md` files in the Agent Skills format. The skills
 * directory may also hold shared instructions every profile starts with
 * (`Common Operating Instructions.md`).
 *
 * The system segments are, in order: the host's {@link turnContract}, the
 * shared instructions, the charter under a `# Role:` heading, then each skill
 * the profile lists, in the profile's order, each under a `# Skill:` heading.
 * Byte caps keep a profile from silently growing: 8 KiB for the shared
 * instructions, 12 KiB for the charter, 16 KiB per skill. A suite names its
 * profile; `--profile` swaps in another file so two versions of one profile
 * run against the same cases.
 *
 * {@link turnContract} is the host's half: the mechanics of one
 * conversational turn (where the final answer goes, that readers see only
 * text). It says nothing about how to behave, so the profile is the whole of
 * the character under test.
 *
 * @since 0.1.0
 */
import { Effect, FileSystem } from "effect";
/**
 * The runtime's description of a turn: the first system segment of every
 * composed profile.
 *
 * @since 0.1.0
 * @category constants
 */
export declare const turnContract: string;
/**
 * Byte caps per part: the shared instructions, the charter, and each skill.
 *
 * @since 0.1.0
 * @category constants
 */
export declare const limits: {
    readonly common: 8192;
    readonly charter: 12288;
    readonly skill: 16384;
};
/**
 * One composed profile: its identity, seat, and system segments.
 *
 * @since 0.1.0
 * @category models
 */
export interface Composed {
    readonly role: string;
    readonly name: string;
    readonly seat: string;
    readonly effort: "low" | "medium" | "high" | undefined;
    readonly skills: ReadonlyArray<string>;
    readonly system: ReadonlyArray<string>;
    /** SHA-256 over the system segments: two runs with one digest ran identical instructions. */
    readonly digest: string;
    readonly bytes: {
        readonly common: number;
        readonly charter: number;
        readonly skills: number;
    };
}
/**
 * Strips a leading `---` frontmatter block and returns the body, or the whole
 * text when it has none.
 *
 * @since 0.1.0
 * @category utils
 */
export declare const splitFrontmatter: (text: string) => {
    readonly body: string;
};
/**
 * What {@link compose} reads: the org directory holding the shared
 * instructions and `Skills/`, the role, its flow body and frontmatter, and an
 * optional reader that replaces direct file reads.
 *
 * @since 0.1.0
 * @category models
 */
export interface Source {
    readonly org: string;
    readonly role: string;
    readonly body: string;
    readonly meta: Record<string, unknown>;
    readonly commonFile?: string | undefined;
    readonly read?: ((path: string) => string) | undefined;
}
/**
 * Composes a profile's system segments, or throws naming the part that is
 * missing or too large.
 *
 * @since 0.1.0
 * @category constructors
 */
export declare const compose: (source: Source) => Composed;
/**
 * Composes a declared shared page and optional skills through the guarded
 * filesystem. Returns no segments when the run grants no shared page and
 * lists no skills.
 *
 * @since 0.1.0
 * @category constructors
 */
export declare const forRun: (root: string, descriptor: {
    readonly name: string;
    readonly frontmatter: Readonly<Record<string, unknown>>;
}, body: string, capabilities: ReadonlyArray<string>) => Effect.Effect<readonly string[], Error | import("effect/PlatformError").PlatformError, FileSystem.FileSystem>;
