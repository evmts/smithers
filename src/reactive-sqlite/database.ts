/**
 * ReactiveDatabase - A reactive wrapper around bun:sqlite
 *
 * Provides automatic query invalidation when data changes.
 */

import { Database } from "bun:sqlite";
import {
  extractReadTables,
  extractWriteTables,
  extractRowFilter,
} from "./parser.js";
import type {
  QuerySubscription,
  SubscriptionCallback,
  ReactiveDatabaseConfig,
  RowFilter,
} from "./types.js";

type PendingInvalidation = {
  tables: Set<string>;
  rowFilters: RowFilter[];
  invalidateAll: boolean;
};

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
  private txDepth = 0;
  private pendingInvalidations: PendingInvalidation[] = [];

  constructor(config: ReactiveDatabaseConfig | string) {
    const options = typeof config === "string" ? { path: config } : config;

    this.db = new Database(options.path, {
      create: options.create ?? true,
      readonly: options.readonly ?? false,
    });

    // Enable WAL mode for better concurrent performance
    this.db.exec("PRAGMA journal_mode = WAL");

    // Enable foreign key enforcement (SQLite disables by default)
    this.db.exec("PRAGMA foreign_keys = ON");
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
    if (this.closed) return;
    this.db.exec(sql);

    // Check if this affects any tables
    const tables = extractWriteTables(sql);
    if (tables.length > 0) {
      this.invalidate(tables);
    } else if (hasWriteKeywords(sql)) {
      this.invalidate();
    }
  }

  /**
   * Prepare a statement for repeated execution
   */
  prepare<T = unknown>(sql: string) {
    if (this.closed) throw new Error('Cannot prepare statement on closed database');
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
    if (this.closed) return undefined as any;
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
    } else {
      // Unknown write target; invalidate everything to avoid stale subscribers.
      this.invalidate();
    }

    return result as any;
  }

  /**
   * Execute a query and return all rows
   */
  query<T = Record<string, unknown>>(sql: string, params: any[] = []): T[] {
    if (this.closed) return [];
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
    if (this.closed) return null;
    const stmt = this.db.prepare<T, any[]>(sql);
    return stmt.get(...params) ?? null;
  }

  /**
   * Execute a query and return a single value
   */
  queryValue<T = unknown>(sql: string, params: any[] = []): T | null {
    if (this.closed) return null;
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
    const useRowFilter = rowFilter && tables.length === 1;

    const subscription: QuerySubscription = {
      id,
      tables: new Set(tables.map((t) => t.toLowerCase())),
      ...(useRowFilter && { rowFilters: [rowFilter] }),
      callback,
    };

    this.subscriptions.set(id, subscription);

    return () => {
      this.subscriptions.delete(id);
    };
  }

  private notifySubscription(subscription: QuerySubscription): void {
    try {
      subscription.callback();
    } catch (error) {
      console.error('[ReactiveDatabase] subscription callback error', error);
    }
  }

  private applyInvalidate(tables?: string[]): void {
    const normalizedTables = tables?.map((t) => t.toLowerCase());

    for (const subscription of this.subscriptions.values()) {
      if (subscription.tables.size === 0) {
        this.notifySubscription(subscription);
        continue;
      }

      if (!normalizedTables) {
        this.notifySubscription(subscription);
        continue;
      }

      for (const table of normalizedTables) {
        if (subscription.tables.has(table)) {
          this.notifySubscription(subscription);
          break;
        }
      }
    }
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

    if (this.txDepth > 0) {
      const pending = this.pendingInvalidations[this.pendingInvalidations.length - 1];
      if (!pending) return;
      for (const value of values) {
        pending.rowFilters.push({
          table: normalizedTable,
          column: normalizedColumn,
          value,
        });
      }
      return;
    }

    const valueSet = new Set(values.map(v => String(v)));

    for (const subscription of this.subscriptions.values()) {
      if (subscription.tables.size === 0) {
        this.notifySubscription(subscription);
        continue;
      }

      // Check if subscription is for this table
      if (!subscription.tables.has(normalizedTable)) {
        continue;
      }

      const tableFilters = subscription.rowFilters?.filter(
        (filter) => filter.table.toLowerCase() === normalizedTable
      ) ?? [];

      if (!subscription.rowFilters || subscription.rowFilters.length === 0 || tableFilters.length === 0) {
        this.notifySubscription(subscription);
        continue;
      }

      const matches = tableFilters.some(
        (filter) =>
          filter.column.toLowerCase() === normalizedColumn &&
          valueSet.has(String(filter.value))
      );

      if (matches) {
        this.notifySubscription(subscription);
      }
    }
  }

  /**
   * Invalidate with row filter - triggers row-level subscriptions that match
   * and falls back to table-level for subscriptions without row filters
   */
  private invalidateWithRowFilter(tables: string[], rowFilter: RowFilter): void {
    const normalizedRowFilter = {
      table: rowFilter.table.toLowerCase(),
      column: rowFilter.column.toLowerCase(),
      value: rowFilter.value,
    };

    if (this.txDepth > 0) {
      const pending = this.pendingInvalidations[this.pendingInvalidations.length - 1];
      if (!pending) return;
      pending.rowFilters.push(normalizedRowFilter);
      for (const table of tables.map((t) => t.toLowerCase())) {
        if (table !== normalizedRowFilter.table) {
          pending.tables.add(table);
        }
      }
      return;
    }

    this.applyInvalidateWithRowFilter(tables, normalizedRowFilter);
  }

  private applyInvalidateWithRowFilter(tables: string[], rowFilter: RowFilter): void {
    const normalizedTables = tables.map((t) => t.toLowerCase());
    const normalizedRowFilter = {
      table: rowFilter.table.toLowerCase(),
      column: rowFilter.column.toLowerCase(),
      value: rowFilter.value,
    };

    for (const subscription of this.subscriptions.values()) {
      if (subscription.tables.size === 0) {
        this.notifySubscription(subscription);
        continue;
      }

      let shouldNotify = false;

      for (const table of normalizedTables) {
        if (!subscription.tables.has(table)) {
          continue;
        }

        const tableFilters = subscription.rowFilters?.filter(
          (filter) => filter.table.toLowerCase() === table
        ) ?? [];

        if (!subscription.rowFilters || subscription.rowFilters.length === 0 || tableFilters.length === 0) {
          shouldNotify = true;
          break;
        }

        if (normalizedRowFilter.table !== table) {
          shouldNotify = true;
          break;
        }

        const matches = tableFilters.some(
          (filter) =>
            filter.column.toLowerCase() === normalizedRowFilter.column &&
            String(filter.value) === String(normalizedRowFilter.value)
        );

        if (matches) {
          shouldNotify = true;
          break;
        }
      }

      if (shouldNotify) {
        this.notifySubscription(subscription);
      }
    }
  }

  /**
   * Invalidate queries that depend on the given tables
   * If no tables specified, invalidates all queries
   */
  invalidate(tables?: string[]): void {
    if (this.txDepth > 0) {
      const pending = this.pendingInvalidations[this.pendingInvalidations.length - 1];
      if (!pending) return;

      if (!tables) {
        pending.invalidateAll = true;
        return;
      }

      for (const table of tables) {
        pending.tables.add(table.toLowerCase());
      }

      return;
    }

    this.applyInvalidate(tables);
  }

  private flushPendingInvalidations(pending: PendingInvalidation): void {
    if (pending.invalidateAll) {
      this.applyInvalidate();
      return;
    }

    if (pending.tables.size > 0) {
      this.applyInvalidate(Array.from(pending.tables));
    }

    if (pending.rowFilters.length === 0) {
      return;
    }

    const tableSet = pending.tables;
    const seen = new Set<string>();

    for (const rowFilter of pending.rowFilters) {
      const table = rowFilter.table.toLowerCase();
      if (tableSet.has(table)) {
        continue;
      }

      const key = `${table}|${rowFilter.column.toLowerCase()}|${String(rowFilter.value)}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      this.applyInvalidateWithRowFilter([table], {
        table,
        column: rowFilter.column.toLowerCase(),
        value: rowFilter.value,
      });
    }
  }

  private mergePendingInvalidations(target: PendingInvalidation, source: PendingInvalidation): void {
    if (source.invalidateAll) {
      target.invalidateAll = true;
    }

    for (const table of source.tables) {
      target.tables.add(table);
    }

    target.rowFilters.push(...source.rowFilters);
  }

  /**
   * Run a function in a transaction
   */
  transaction<T>(fn: () => T): T {
    this.txDepth += 1;
    this.pendingInvalidations.push({
      tables: new Set(),
      rowFilters: [],
      invalidateAll: false,
    });

    let success = false;
    try {
      const result = this.db.transaction(fn)();
      success = true;
      return result;
    } finally {
      const pending = this.pendingInvalidations.pop();
      this.txDepth = Math.max(0, this.txDepth - 1);

      if (pending && success) {
        if (this.txDepth > 0) {
          const parent = this.pendingInvalidations[this.pendingInvalidations.length - 1];
          if (parent) {
            this.mergePendingInvalidations(parent, pending);
          }
        } else {
          this.flushPendingInvalidations(pending);
        }
      }
    }
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

function hasWriteKeywords(sql: string): boolean {
  const normalized = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .toLowerCase()

  return /\b(insert|update|delete|create|drop|alter|replace)\b/.test(normalized)
}
