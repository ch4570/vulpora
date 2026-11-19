import type { AppConfig } from '../config.js';

export const DEFAULT_MAX_RESULT_BYTES = 1_048_576;

/** Authored stable error: never includes SQL, values or connection details. */
export class ResultLimitError extends Error {
  override readonly name = 'ResultLimitError';
  readonly code = 'NLSQL_RESULT_LIMIT_EXCEEDED';
  constructor() { super('Database result exceeds the configured collection budget.'); }
}

/** Bounds retained decoded results; driver parsers still materialize one cell/row. */
export class ResultBudget {
  readonly rows: Record<string, unknown>[] = [];
  fields: string[] = [];
  private bytes = 0;
  private nodes = 0;
  private described = false;
  private readonly maxRows: number;
  private readonly maxBytes: number;

  constructor(config: Pick<AppConfig, 'maxRows' | 'maxResultBytes'>) {
    this.maxRows = config.maxRows ?? 100;
    this.maxBytes = config.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES;
  }

  private charge(bytes: number): void {
    this.bytes += bytes;
    if (this.bytes > this.maxBytes) throw new ResultLimitError();
  }

  private string(value: string): void {
    if (value.length > this.maxBytes - this.bytes) throw new ResultLimitError();
    this.charge(Buffer.byteLength(value, 'utf8') + 2);
  }

  private measure(value: unknown, depth: number, seen: WeakSet<object>): void {
    if (++this.nodes > 100_000 || depth > 32) throw new ResultLimitError();
    this.charge(16);
    if (typeof value === 'string') { this.string(value); return; }
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return;
    if (typeof value === 'bigint') { this.string(value.toString()); return; }
    if (typeof value !== 'object') throw new ResultLimitError();
    const prototype = Object.getPrototypeOf(value);
    const expectedPrototype = Buffer.isBuffer(value) ? Buffer.prototype
      : value instanceof Date ? Date.prototype : Array.isArray(value) ? Array.prototype : Object.prototype;
    if (prototype !== expectedPrototype && !(expectedPrototype === Object.prototype && prototype === null)) {
      throw new ResultLimitError();
    }
    if (Buffer.isBuffer(value)) { this.charge(value.byteLength); return; }
    if (value instanceof Date) { this.charge(24); return; }
    if (Array.isArray(value)) {
      // JSON serialization expands holes into nulls; enumerable keys alone
      // cannot measure a sparse array's eventual output or traversal cost.
      if (value.length > 100_000 - this.nodes || value.length * 16 > this.maxBytes - this.bytes) {
        throw new ResultLimitError();
      }
      for (let index = 0; index < value.length; index++) {
        if (!Object.hasOwn(value, index)) throw new ResultLimitError();
      }
    }
    if (seen.has(value)) throw new ResultLimitError();
    seen.add(value);
    // Avoid Object.entries/JSON.stringify allocating another unbounded object.
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      this.string(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!('value' in descriptor)) throw new ResultLimitError();
      this.measure(descriptor.value, depth + 1, seen);
    }
    seen.delete(value);
  }

  setFields(fields: readonly string[]): void {
    if (this.described) throw new ResultLimitError(); // Never merge separate result sets.
    this.described = true;
    this.measure(fields, 0, new WeakSet());
    this.fields = [...fields];
  }

  addRow(row: Record<string, unknown>): void {
    if (this.rows.length >= this.maxRows) throw new ResultLimitError();
    this.measure(row, 0, new WeakSet());
    this.rows.push(row);
  }
}
