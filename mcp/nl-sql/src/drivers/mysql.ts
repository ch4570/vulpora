import mysql from 'mysql2/promise';
import type { Connection as CoreConnection, FieldPacket } from 'mysql2';
import type { Duplex } from 'node:stream';
import type { AppConfig } from '../config.js';
import { emitDriverCode, type Driver, type DriverErrorSink, type QueryResult } from './types.js';
import { ResultBudget } from './result-budget.js';
import { withDeadline } from './deadline.js';
import { assertRuntimeCompatible, DEFAULT_MAX_INBOUND_BYTES, installInboundGate, mysqlInboundStream, type InboundGate } from './inbound-budget.js';

function sslOptions(config: AppConfig): mysql.ConnectionOptions['ssl'] {
  if (!config.ssl) return undefined;
  const rejectUnauthorized = config.sslMode === 'verify-ca' || config.sslMode === 'verify-full';
  const uriSsl = config.connectionString && new URL(config.connectionString).searchParams.get('ssl');
  if (uriSsl) {
    // Match mysql2's URI option decoding while retaining custom certificates.
    let parsed: unknown;
    try { parsed = JSON.parse(uriSsl); } catch { parsed = uriSsl; }
    // mysql2 resolves named profiles to their CA bundle with verification enabled.
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const uriOptions = parsed as mysql.SslOptions;
      return { ...uriOptions, rejectUnauthorized: rejectUnauthorized || uriOptions.rejectUnauthorized !== false };
    }
  }
  return { rejectUnauthorized };
}

/** MySQL — START TRANSACTION READ ONLY + ROLLBACK(엔진 레벨 하드 보장, 5.6.5+). */
export class MysqlDriver implements Driver {
  private readonly pool: mysql.Pool;
  private readonly timeoutMs: number;
  private readonly defaultSchema: string;
  private readonly config: AppConfig;

  constructor(config: AppConfig, onError: DriverErrorSink = () => {}) {
    this.config = config;
    this.timeoutMs = config.statementTimeoutMs;
    this.defaultSchema = config.allowedSchemas[0]!;
    // mysql2's URI merge treats a false option as absent; remove the URI
    // override too, then verify the effective setting on the acquired session.
    const uri = config.connectionString ? new URL(config.connectionString) : undefined;
    uri?.searchParams.delete('compress');
    this.pool = mysql.createPool({
      ...(uri
        ? { uri: uri.href }
        : {
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.user,
          password: config.password,
        }),
      ssl: sslOptions(config),
      compress: false, // inbound budgeting must precede any decompression expansion
      connectionLimit: 4,
      connectTimeout: 10_000,
    });
    this.pool.pool.on('error', () => emitDriverCode(onError, 'NLSQL_DB_CONNECTION_LOST'));
    this.pool.on('connection', (connection) => {
      connection.on('error', () => emitDriverCode(onError, 'NLSQL_DB_CONNECTION_LOST'));
    });
  }

  async ping(): Promise<string> {
    const r = await this.runReadOnly('select version() as v', []);
    const v = r.rows[0]?.['v'];
    return typeof v === 'string' ? `MySQL ${v}` : 'MySQL';
  }

  async runReadOnly(sql: string, params: readonly unknown[]): Promise<QueryResult> {
    assertRuntimeCompatible('mysql');
    const conn = await this.pool.getConnection();
    const started = Date.now();
    let primaryFailed = false;
    let discarded = false;
    let inbound: InboundGate | undefined;
    let rejectInbound!: (error: Error) => void;
    const inboundFailure = new Promise<never>((_, reject) => { rejectInbound = reject; });
    void inboundFailure.catch(() => {});
    const core = conn.connection as unknown as CoreConnection & { stream: Duplex };
    const discard = () => {
      if (discarded) return;
      discarded = true;
      try { conn.destroy(); } finally { core.stream.destroy(); }
    };
    const command = (text: string) => withDeadline(Promise.race([conn.query(text), inboundFailure]), this.timeoutMs, discard);
    try {
      inbound = installInboundGate(mysqlInboundStream(core), 'emit', this.config.maxInboundBytes ?? DEFAULT_MAX_INBOUND_BYTES, (error) => {
        rejectInbound(error);
        discard();
      });
      // Keep unqualified stored-function resolution inside an allowed database.
      await command(`USE \`${this.defaultSchema}\``);
      // Fail closed if the server cannot enforce the configured SELECT timeout.
      await command(`SET SESSION MAX_EXECUTION_TIME = ${this.timeoutMs}`);
      await command('START TRANSACTION READ ONLY');
      // Server-side binding keeps values out of SQL text, including when the
      // server enables NO_BACKSLASH_ESCAPES (query() uses client-side escaping).
      const budget = new ResultBudget(this.config);
      await withDeadline(Promise.race([inboundFailure, new Promise<void>((resolve, reject) => {
        let failed = false;
        const stop = (error: unknown) => {
          if (failed) return;
          failed = true;
          // mysql2.destroy() ends the stream gracefully; destroy the transport
          // too so a server producing rows cannot keep the socket alive.
          reject(error);
          try { discard(); } catch { /* preserve the collection error */ }
        };
        // No callback: mysql2 emits each result instead of filling _currentRows.
        const query = core.execute({ sql, values: params as unknown[] });
        query.on('fields', (fields: FieldPacket[]) => {
          if (failed || discarded) return;
          try { budget.setFields(fields.map((field) => field.name)); } catch (error) { stop(error); }
        });
        query.on('result', (row: Record<string, unknown>) => {
          if (failed || discarded) return;
          try { budget.addRow(row); } catch (error) { stop(error); }
        });
        query.on('error', (error: Error) => { failed = true; reject(error); });
        query.on('end', () => { if (!failed && !discarded) resolve(); });
      })]), this.timeoutMs, discard);
      return { fields: budget.fields, rows: budget.rows, rowCount: budget.rows.length, elapsedMs: Date.now() - started };
    } catch (error) {
      primaryFailed = true;
      throw inbound?.error ?? error;
    } finally {
      let rollbackFailed = false;
      if (!discarded && inbound) try { await command('ROLLBACK'); } catch { rollbackFailed = true; }
      try {
        // destroy() removes a suspect connection from the pool; do not release
        // it afterwards, including when destruction itself throws.
        if (discarded) { /* overflow/error already discarded the owned connection */ }
        else if (primaryFailed || rollbackFailed || !inbound) discard();
        else {
          try { inbound.restore(); } catch (error) { discard(); throw error; }
          conn.release();
        }
        if (!primaryFailed && inbound?.error) throw inbound.error;
      } catch (error) {
        if (!primaryFailed) throw error;
      }
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
