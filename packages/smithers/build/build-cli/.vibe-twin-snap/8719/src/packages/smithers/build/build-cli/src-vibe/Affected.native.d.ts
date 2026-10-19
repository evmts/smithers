/** `Path.posix.basename(path)`. */
export declare const posixBasename: (path: string) => string;
/** `Path.posix.isAbsolute(path)`. */
export declare const posixIsAbsolute: (path: string) => boolean;
/** `Path.relative(from, to)`. */
export declare const relative: (from: string, to: string) => string;
/** `Path.isAbsolute(path)`. */
export declare const isAbsolute: (path: string) => boolean;
/** `changedPaths`, unchanged. */
export declare const changedPaths: (root: string, options: {
    readonly base: string;
    readonly head?: string | undefined;
    readonly files?: ReadonlyArray<string> | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly timeoutMs?: number | undefined;
    readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
}) => Promise<ReadonlyArray<string>>;
