import pg from 'pg';
import type { AppConfig } from '../config.js';
import { emitDriverCode, type Driver, type DriverErrorSink, type QueryResult } from './types.js';

const { Pool } = pg;

/** PostgreSQL — BEGIN TRANSACTION READ ONLY + 항상 ROLLBACK(엔진 레벨 하드 보장). */
export class PostgresDriver implements Driver {
  private readonly pool: pg.Pool;
  private readonly timeoutMs: number;
  private readonly searchPathSql: string;

  constructor(config: AppConfig, onError: DriverErrorSink = () => {}) {
    this.timeoutMs = config.statementTimeoutMs;
    this.searchPathSql = ['pg_catalog', ...config.allowedSchemas.map((schema) => `"${schema}"`)].join(', ');
    this.pool = new Pool({
      connectionString: config.connectionString,
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: config.sslMode === 'verify-ca' || config.sslMode === 'verify-full' } : undefined,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'nl-sql-mcp',
    });
    // pg emits idle-client failures as EventEmitter errors; consume them so Node
    // cannot print the original connection error (which may contain host details).
    this.pool.on('error', () => emitDriverCode(onError, 'NLSQL_DB_CONNECTION_LOST'));
  }

  async ping(): Promise<string> {
    const r = await this.runReadOnly('select version() as v', []);
    const v = r.rows[0]?.['v'];
    return typeof v === 'string' ? v : 'PostgreSQL';
  }

  async runReadOnly(sql: string, params: readonly unknown[]): Promise<QueryResult> {
    const client = await this.pool.connect();
    const started = Date.now();
    try {
      await client.query('BEGIN TRANSACTION READ ONLY');
      // Make ordinary string parsing deterministic for the static lexer. E'...'
      // escape strings remain supported explicitly by the guard.
      await client.query('SET LOCAL standard_conforming_strings = on');
      await client.query(`SET LOCAL search_path = ${this.searchPathSql}`);
      await client.query(`SET LOCAL statement_timeout = ${this.timeoutMs}`);
      await client.query('SET LOCAL idle_in_transaction_session_timeout = 15000');
      const res = await client.query({ text: sql, values: params as unknown[] });
      return {
        fields: res.fields?.map((f) => f.name) ?? [],
        rows: (res.rows ?? []) as Record<string, unknown>[],
        rowCount: res.rowCount ?? res.rows?.length ?? 0,
        elapsedMs: Date.now() - started,
      };
    } finally {
      try { await client.query('ROLLBACK'); } catch { /* 무시 */ }
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
