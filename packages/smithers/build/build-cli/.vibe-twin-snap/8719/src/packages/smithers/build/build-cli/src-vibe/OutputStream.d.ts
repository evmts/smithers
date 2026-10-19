/**
 * Bounded, redacted live views of subprocess output; captured results stay untouched.
 * @since 1.0.0
 */
/**
 * A per-process observer, with independent UTF-8 decoders for the two pipes.
 * @category models
 * @since 1.0.0
 */
export interface Observer {
    readonly onStdout: (chunk: Uint8Array) => void;
    readonly onStderr: (chunk: Uint8Array) => void;
    readonly close: () => void;
}
/**
 * Shared progress-only redaction with the diagnostic rules, including known
 * values from credential-named variables.
 * @category constructors
 * @since 1.0.0
 */
export declare const redactor: (environment?: Readonly<Record<string, string | undefined>>, sensitiveNames?: ReadonlyArray<string>) => (text: string) => string;
/**
 * Complete lines are redacted before truncation or display, including split secrets
 * and values spanning lines (a PEM block, a `util.inspect` concatenation).
 * The shared line redactor bounds an overlong line and shows only
 * `Redaction.omittedLine` for it.
 * @category constructors
 * @since 1.0.0
 */
export declare const make: (options: {
    readonly write: (stream: "stdout" | "stderr", text: string) => void;
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
    readonly sensitiveNames?: ReadonlyArray<string> | undefined;
    readonly maximumLines?: number | undefined;
}) => Observer;
