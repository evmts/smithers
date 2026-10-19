/**
 * ANSI terminal primitives for the human renderers.
 *
 * A colour palette that degrades to the identity function, capability
 * detection that follows the `NO_COLOR` and `FORCE_COLOR` conventions the
 * `supports-color` package and Turborepo's `ColorConfig::infer` codified, and
 * the three cursor motions the live renderer needs. Raw escape sequences
 * rather than a dependency: the whole surface is six colours, two
 * attributes, and a handful of control sequences, and every consumer is
 * inside this package.
 *
 * @since 0.1.0
 */
/**
 * Text decorators. Each returns its input wrapped in the SGR sequences for one
 * attribute, or the input unchanged when the palette is {@link none}.
 *
 * @category models
 * @since 0.1.0
 */
export interface Palette {
    readonly enabled: boolean;
    readonly bold: (text: string) => string;
    readonly dim: (text: string) => string;
    readonly red: (text: string) => string;
    readonly green: (text: string) => string;
    readonly yellow: (text: string) => string;
    readonly blue: (text: string) => string;
    readonly magenta: (text: string) => string;
    readonly cyan: (text: string) => string;
    readonly inverse: (text: string) => string;
}
/**
 * The process environment slice the detectors read.
 *
 * @category models
 * @since 0.1.0
 */
export type Environment = Readonly<Record<string, string | undefined>>;
/**
 * The palette that emits escape sequences.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const colors: Palette;
/**
 * The palette that leaves text alone.
 *
 * @category constants
 * @since 0.1.0
 */
export declare const none: Palette;
/**
 * Whether `FORCE_COLOR` asks for colour. `0` and `false` refuse it, any other
 * present value requests it, and an absent variable says nothing.
 *
 * @category detection
 * @since 0.1.0
 */
export declare const forcedColor: (env: Environment) => boolean | undefined;
/**
 * Whether colour may be emitted on a stream.
 *
 * `NO_COLOR` set to anything but the empty string wins, then `FORCE_COLOR`,
 * then `TERM=dumb` refuses, and otherwise the answer is whether the stream is
 * a terminal. That is the order `supports-color` applies and the one
 * `no-color.org` asks for.
 *
 * @category detection
 * @since 0.1.0
 */
export declare const colorSupport: (env: Environment, isTTY: boolean) => boolean;
/**
 * The palette a stream gets: {@link colors} when {@link colorSupport} allows
 * it, {@link none} otherwise.
 *
 * @category detection
 * @since 0.1.0
 */
export declare const palette: (env: Environment, isTTY: boolean) => Palette;
/**
 * Removes every escape sequence, leaving the visible text.
 *
 * @category text
 * @since 0.1.0
 */
export declare const strip: (text: string) => string;
/**
 * The number of terminal cells a string occupies, counting code points and
 * ignoring escape sequences. The glyphs the renderers use are all single
 * width, so this is exact for their output and approximate for arbitrary
 * tool output.
 *
 * @category text
 * @since 0.1.0
 */
export declare const visibleWidth: (text: string) => number;
/**
 * Cuts a string to `columns` visible cells, ending it with an ellipsis and a
 * reset when it was cut. Escape sequences pass through uncounted so a
 * coloured line truncates on its text rather than on its control bytes.
 *
 * @category text
 * @since 0.1.0
 */
export declare const truncate: (text: string, columns: number) => string;
/**
 * Moves the cursor up `lines` rows; the empty string for zero.
 *
 * @category cursor
 * @since 0.1.0
 */
export declare const cursorUp: (lines: number) => string;
/**
 * Erases from the cursor to the end of the screen.
 *
 * @category cursor
 * @since 0.1.0
 */
export declare const eraseDown = "\u001B[0J";
/**
 * Hides the cursor while the live region redraws.
 *
 * @category cursor
 * @since 0.1.0
 */
export declare const hideCursor = "\u001B[?25l";
/**
 * Shows the cursor again.
 *
 * @category cursor
 * @since 0.1.0
 */
export declare const showCursor = "\u001B[?25h";
