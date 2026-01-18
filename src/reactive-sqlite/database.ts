/**
 * ReactiveDatabase - A reactive wrapper around bun:sqlite
 *
 * Provides automatic query invalidation when data changes.
 */

import { Database } from "bun:sqlite";
import {
  extractReadTables,
  extractWriteTables,
  isWriteOperation,
  extractRowFilter,
} from "./parser";
import type {
  QuerySubscription,
  SubscriptionCallback,
  ReactiveDatabaseConfig,
  RowFilter,
} from "./types";

/**
 * ReactiveDatabase wraps bun:sqlite with reactive subscriptions
 *
 * @example
 * ```ts
 * const db = new ReactiveDatabase({ path: 'mydb.sqlite' })
 *
 * // Execute schema
 * db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)`)
 *
 * // Query with auto-tracking
 * const users = db.query('SELECT * FROM users').all()
 *
 * // Mutations auto-invalidate
 * db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
 * ```
 */
export class ReactiveDatabase {
  private db: Database;
  private subscriptions: Map<string, QuerySubscription> = new Map();
  private nextSubscriptionId = 0;
  private closed = false;

  constructor(config: ReactiveDatabaseConfig | string) {
    const options = typeof config === "string" ? { path: config } : config;

    this.db = new Database(options.path, {
      create: options.create ?? true,
      readonly: options.readonly ?? false,
    });

    // Enable WAL mode for better concurrent performance
    this.db.exec("PRAGMA journal_mode = WAL");
  }

  /**
   * Get the underlying bun:sqlite Database instance
   */
  get raw(): Database {
    return this.db;
  }

  /**
   * Execute raw SQL (for schema, pragmas, etc.)
   */
  exec(sql: string): void {
    this.db.exec(sql);

    // Check if this affects any tables
    if (isWriteOperation(sql)) {
      const tables = extractWriteTables(sql);
      if (tables.length > 0) {
        this.invalidate(tables);
      }
    }
  }

  /**
   * Prepare a statement for repeated execution
   */
  prepare<T = unknown>(sql: string) {
    return this.db.prepare<T, any[]>(sql);
  }

  /**
   * Run a write operation (INSERT, UPDATE, DELETE)
   * Auto-invalidates affected queries with row-level granularity when possible
   */
  run(
    sql: string,
    params: any[] = [],
  ): Database["run"] extends (...args: any[]) => infer R ? R : never {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);

    // Auto-invalidate affected tables
    const tables = extractWriteTables(sql);
    if (tables.length > 0) {
      // Try to extract row filter for fine-grained invalidation
      const rowFilter = extractRowFilter(sql, params);

      if (rowFilter) {
        // Row-level invalidation - only notify subscriptions for this specific row
        this.invalidateWithRowFilter(tables, rowFilter);
      } else {
        // Fall back to table-level invalidation
        this.invalidate(tables);
      }
    }

    return result as any;
  }

  /**
   * Execute a query and return all rows
   */
  query<T = Record<string, unknown>>(sql: string, params: any[] = []): T[] {
    const stmt = this.db.prepare<T, any[]>(sql);
    return stmt.all(...params);
  }

  /**
   * Execute a query and return the first row
   */
  queryOne<T = Record<string, unknown>>(
    sql: string,
    params: any[] = [],
  ): T | null {
    const stmt = this.db.prepare<T, any[]>(sql);
    return stmt.get(...params) ?? null;
  }

  /**
   * Execute a query and return a single value
   */
  queryValue<T = unknown>(sql: string, params: any[] = []): T | null {
    const row = this.queryOne<Record<string, T>>(sql, params);
    if (!row) return null;
    const values = Object.values(row);
    return values[0] ?? null;
  }

  /**
   * Subscribe to changes on specific tables
   * Returns unsubscribe function
   */
  subscribe(tables: string[], callback: SubscriptionCallback): () => void {
    const id = String(this.nextSubscriptionId++);
    const subscription: QuerySubscription = {
      id,
      tables: new Set(tables.map((t) => t.toLowerCase())),
      callback,
    };

    this.subscriptions.set(id, subscription);

    return () => {
      this.subscriptions.delete(id);
    };
  }

  /**
   * Subscribe to a specific query
   * Automatically detects which tables are involved
   */
  subscribeQuery(sql: string, callback: SubscriptionCallback): () => void {
    const tables = extractReadTables(sql);
    return this.subscribe(tables, callback);
  }

  /**
   * Subscribe to a query with row-level filtering
   * Only triggers when the specific row is modified
   */
  subscribeWithRowFilter(
    sql: string,
    params: unknown[],
    callback: SubscriptionCallback
  ): () => void {
    const id = String(this.nextSubscriptionId++);
    const tables = extractReadTables(sql);
    const rowFilter = extractRowFilter(sql, params);

    const subscription: QuerySubscription = {
      id,
      tables: new Set(tables.map((t) => t.toLowerCase())),
      rowFilters: rowFilter ? [rowFilter] : undefined,
      callback,
    };

    this.subscriptions.set(id, subscription);

    return () => {
      this.subscriptions.delete(id);
    };
  }

  /**
   * Invalidate subscriptions for specific rows
   */
  invalidateRows(
    table: string,
    column: string,
    values: (string | number)[]
  ): void {
    const normalizedTable = table.toLowerCase();
    const normalizedColumn = column.toLowerCase();
    const valueSet = new Set(values.map(v => String(v)));

    for (const subscription of this.subscriptions.values()) {
      // Check if subscription is for this table
      if (!subscription.tables.has(normalizedTable)) {
        continue;
      }

      // If subscription has row filters, check if any match
      if (subscription.rowFilters && subscription.rowFilters.length > 0) {
        const matches = subscription.rowFilters.some(
          (filter) =>
            filter.table.toLowerCase() === normalizedTable &&
            filter.column.toLowerCase() === normalizedColumn &&
            valueSet.has(String(filter.value))
        );

        if (matches) {
          subscription.callback();
        }
      } else {
        // No row filters - this is a table-level subscription, trigger it
        subscription.callback();
      }
    }
  }

  /**
   * Invalidate with row filter - triggers row-level subscriptions that match
   * and falls back to table-level for subscriptions without row filters
   */
  private invalidateWithRowFilter(tables: string[], rowFilter: RowFilter): void {
    const normalizedTables = tables.map((t) => t.toLowerCase());

    for (const subscription of this.subscriptions.values()) {
      // Check if subscription depends on any of the invalidated tables
      let affectedTable: string | null = null;
      for (const table of normalizedTables) {
        if (subscription.tables.has(table)) {
          affectedTable = table;
          break;
        }
      }

      if (!affectedTable) {
        continue;
      }

      // If subscription has row filters, check if this row filter matches
      if (subscription.rowFilters && subscription.rowFilters.length > 0) {
        const matches = subscription.rowFilters.some(
          (filter) =>
            filter.table.toLowerCase() === rowFilter.table.toLowerCase() &&
            filter.column.toLowerCase() === rowFilter.column.toLowerCase() &&
            String(filter.value) === String(rowFilter.value)
        );

        if (matches) {
          subscription.callback();
        }
      } else {
        // No row filters - this is a table-level subscription, always trigger
        subscription.callback();
      }
    }
  }

  /**
   * Invalidate queries that depend on the given tables
   * If no tables specified, invalidates all queries
   */
  invalidate(tables?: string[]): void {
    const normalizedTables = tables?.map((t) => t.toLowerCase());

    for (const subscription of this.subscriptions.values()) {
      if (!normalizedTables) {
        // Invalidate all
        subscription.callback();
      } else {
        // Check if subscription depends on any of the invalidated tables
        for (const table of normalizedTables) {
          if (subscription.tables.has(table)) {
            subscription.callback();
            break;
          }
        }
      }
    }
  }

  /**
   * Run a function in a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (!this.closed) {
      this.subscriptions.clear();
      this.db.close();
      this.closed = true;
    }
  }

  /**
   * Check if database is closed
   */
  get isClosed(): boolean {
    return this.closed;
  }
}

/**
 * Create a new ReactiveDatabase instance
 */
export function createReactiveDatabase(
  config: ReactiveDatabaseConfig | string,
): ReactiveDatabase {
  return new ReactiveDatabase(config);
}
