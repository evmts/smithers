/**
 * A private directory of JSON records: owner-only permissions, no symbolic
 * links, and atomic replacement of every record.
 * @since 1.0.0
 */
/**
 * Creates or opens a store directory readable only by its owner and returns its canonical path.
 * @category store
 * @since 1.0.0
 */
export declare const ensure: (directory: string) => string;
/**
 * Atomically replaces one record, readable only by its owner.
 * @category store
 * @since 1.0.0
 */
export declare const write: (directory: string, name: string, value: unknown) => void;
/**
 * Reads one record, or undefined when it does not exist. A symbolic link or other non-file fails.
 * @category store
 * @since 1.0.0
 */
export declare const read: (directory: string, name: string) => unknown;
/**
 * Reads every record in one collection, in name order.
 * @category store
 * @since 1.0.0
 */
export declare const list: (directory: string, name: string) => ReadonlyArray<unknown>;
