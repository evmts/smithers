/**
 * Refuses positional arguments that no command argument consumes.
 *
 * incur 0.5 assigns positionals to a command's argument keys in order and
 * silently drops the rest unless the last key is an array, so an unguarded
 * `clean //a/... //b/...` would clean only `//a/...`. {@link guard} makes every
 * command of a CLI refuse such an invocation with the typed
 * `UNEXPECTED_ARGUMENT` error before its handler runs.
 *
 * wevm/incur#231 ("reject unexpected positional arguments") proposed this in
 * incur itself and was never merged. Delete this module once incur rejects
 * surplus positionals on its own.
 *
 * @since 0.1.0
 */
import { Cli, z } from "incur";
/** The slice of an incur registry entry the guard reads. */
interface Entry {
    readonly _alias?: true;
    readonly target?: string;
    readonly _group?: true;
    readonly commands?: ReadonlyMap<string, Entry>;
    readonly root?: Entry;
    readonly args?: z.ZodObject<any> | undefined;
    readonly options?: z.ZodObject<any> | undefined;
    readonly alias?: Record<string, string> | undefined;
}
/**
 * The positionals `tokens` pass to `command` beyond the ones its argument keys
 * consume; `undefined` when the tokens do not parse, which incur reports itself.
 *
 * @category parsing
 * @since 0.1.0
 */
export declare const unconsumed: (command: Pick<Entry, "args" | "options" | "alias">, tokens: ReadonlyArray<string>) => ReadonlyArray<string> | undefined;
/**
 * The positionals an argv passes to the command at `path` beyond the ones it
 * consumes; `undefined` when the argv serves stdio MCP, names no command, or
 * does not parse.
 *
 * @category parsing
 * @since 0.1.0
 */
export declare const surplus: (cli: Cli.Cli<any, any, any, any>, argv: ReadonlyArray<string>, path: ReadonlyArray<string>, globals?: z.ZodObject<any>) => ReadonlyArray<string> | undefined;
/**
 * Makes every command `cli` serves refuse unconsumed positionals.
 *
 * Pass the CLI's `globals` schema so its global flags are not mistaken for
 * positionals. Commands mounted after this call are guarded too.
 *
 * @category constructors
 * @since 0.1.0
 */
export declare const guard: <A extends Cli.Cli<any, any, any, any>>(cli: A, globals?: z.ZodObject<any>) => A;
export {};
