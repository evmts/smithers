/** Private control persistence over the selected native SQL adapter.
 * @since 1.0.0
 */
import * as DurableWriter from "@smthrs/database/DurableWriter";
import { FileSystem, Layer, Path } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";
/** Uses injected filesystem and path services, and opens only the supplied SQL adapter.
 * @since 1.0.0
 * @private
 */
export declare const make: (database: (filename: string) => Layer.Layer<SqlClient>) => (file: string) => Layer.Layer<DurableWriter.DurableWriter | SqlClient, import("effect/sql/Migrator").MigrationError | import("effect/PlatformError").PlatformError | import("effect/sql/SqlError").SqlError, FileSystem.FileSystem | Path.Path>;
/** Opens an existing store with the supplied read-only SQL adapter: no directory,
 * migration or permission change.
 * @since 1.0.0
 * @private
 */
export declare const observe: (database: (filename: string) => Layer.Layer<SqlClient>) => (file: string) => Layer.Layer<DurableWriter.DurableWriter | SqlClient, never, never>;
