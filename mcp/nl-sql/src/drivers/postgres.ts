import pg from 'pg';
import type { AppConfig } from '../config.js';
import { emitDriverCode, type Driver, type DriverErrorSink, type QueryResult } from './types.js';
import { ResultBudget } from './result-budget.js';
import { withDeadline } from './deadline.js';
import { assertRuntimeCompatible, DEFAULT_MAX_INBOUND_BYTES, installInboundGate, postgresInboundStream, type InboundGate } from './inbound-budget.js';

const { Pool } = pg;

/** PostgreSQL — BEGIN TRANSACTION READ ONLY + 항상 ROLLBACK(엔진 레벨 하드 보장). */
export class PostgresDriver implements Driver {
  private readonly pool: pg.Pool;
  private readonly timeoutMs: number;
  private readonly searchPathSql: string;
  private readonly config: AppConfig;

  constructor(config: AppConfig, onError: DriverErrorSink = () => {}) {
    this.config = config;
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
    assertRuntimeCompatible('postgres');
    const client = await this.pool.connect();
    const started = Date.now();
    let primaryFailed = false;
    let discarded = false;
    let inbound: InboundGate | undefined;
    let rejectInbound!: (error: Error) => void;
    const inboundFailure = new Promise<never>((_, reject) => { rejectInbound = reject; });
    void inboundFailure.catch(() => {});
    const discard = () => {
      if (discarded) return;
      discarded = true;
      client.release(true);
    };
    const command = (text: string) => withDeadline(Promise.race([client.query(text), inboundFailure]), this.timeoutMs, discard);
    try {
      inbound = installInboundGate(postgresInboundStream(client), 'emit', this.config.maxInboundBytes ?? DEFAULT_MAX_INBOUND_BYTES, (error) => {
        rejectInbound(error); // settle the stable error before synchronous close errors
        discard();
      });
      await command('BEGIN TRANSACTION READ ONLY');
      // Make ordinary string parsing deterministic for the static lexer. E'...'
      // escape strings remain supported explicitly by the guard.
      await command('SET LOCAL standard_conforming_strings = on');
      await command(`SET LOCAL search_path = ${this.searchPathSql}`);
      await command(`SET LOCAL statement_timeout = ${this.timeoutMs}`);
      await command('SET LOCAL idle_in_transaction_session_timeout = 15000');
      const budget = new ResultBudget(this.config);
      await withDeadline(Promise.race([inboundFailure, new Promise<void>((resolve, reject) => {
        const query = new pg.Query({ text: sql, values: params as unknown[] });
        let failed = false;
        let described = false;
        const stop = (error: unknown) => {
          if (failed) return;
          failed = true;
          // Terminating this owned connection cancels the query without another
          // connection, and prevents a still-running transaction from pooling.
          reject(error);
          try { discard(); } catch { /* preserve the collection error */ }
        };
        const describe = (result: pg.QueryResult) => {
          if (!described) { budget.setFields(result.fields.map((field) => field.name)); described = true; }
        };
        // Attach before submission: pg.Query then disables its result.rows array.
        query.on('row', (row: Record<string, unknown>, result) => {
          if (failed || discarded) return;
          try {
            if (!result) throw new Error('Missing result metadata.');
            describe(result); budget.addRow(row);
          } catch (error) { stop(error); }
        });
        query.on('error', (error: Error) => { failed = true; reject(error); });
        query.on('end', (result: pg.QueryResult) => {
          if (failed || discarded) return;
          try { describe(result); resolve(); } catch (error) { stop(error); }
        });
        try { client.query(query); } catch (error) { stop(error); }
      })]), this.timeoutMs, discard);
      return {
        fields: budget.fields,
        rows: budget.rows,
        rowCount: budget.rows.length,
        elapsedMs: Date.now() - started,
      };
    } catch (error) {
      primaryFailed = true;
      throw inbound?.error ?? error;
    } finally {
      let rollbackFailed = false;
      if (!discarded && inbound) try { await command('ROLLBACK'); } catch { rollbackFailed = true; }
      try {
        // A failed rollback leaves transaction state unknown: never reuse it.
        if (discarded) { /* overflow already discarded the owned connection */ }
        else if (primaryFailed || rollbackFailed || !inbound) discard();
        else {
          try { inbound.restore(); } catch (error) { discard(); throw error; }
          client.release();
        }
        if (!primaryFailed && inbound?.error) throw inbound.error;
      } catch (error) {
        // Cleanup must not replace the original setup/query failure. Without
        // one, a failed release/discard cannot be reported as a successful query.
        if (!primaryFailed) throw error;
      }
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
