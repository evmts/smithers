/** Node adapter for the shared private control persistence layer.
 * @since 1.0.0
 */
import { Layer } from "effect";
/** Opens private control state with the existing Node database adapter.
 * @category layers
 * @since 1.0.0
 */
export declare const layer: (file: string) => Layer.Layer<import("@smthrs/database/DurableWriter").DurableWriter | import("effect/sql/SqlClient").SqlClient, import("effect/sql/Migrator").MigrationError | import("effect/PlatformError").PlatformError | import("effect/sql/SqlError").SqlError, never>;
/** Opens existing control or engine state read-only with the Node database adapter.
 * @category layers
 * @since 1.0.0
 */
export declare const observe: (file: string) => Layer.Layer<import("@smthrs/database/DurableWriter").DurableWriter | import("effect/sql/SqlClient").SqlClient, never, never>;
