/**
 * The schema installed before any service opens the shared control database.
 *
 * Memory can be the first CLI command a project runs. Installing every lower
 * block here keeps that command from advancing the migration cursor past
 * control and engine tables that a later command still needs to create.
 *
 * @since 1.0.0
 */
/**
 * Applies the complete shared schema in a single ordered migration pass.
 *
 * @category layers
 * @since 1.0.0
 */
export declare const layer: import("effect/Layer").Layer<never, import("effect/sql/Migrator").MigrationError | import("effect/sql/SqlError").SqlError, import("effect/sql/SqlClient").SqlClient>;
