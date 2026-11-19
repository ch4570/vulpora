import sql from 'mssql';
import type { AppConfig } from '../config.js';
import { emitDriverCode, type Driver, type DriverErrorSink, type QueryResult } from './types.js';
import { ResultBudget, ResultLimitError } from './result-budget.js';
import { assertRuntimeCompatible, DEFAULT_MAX_INBOUND_BYTES, DriverCompatibilityError, installInboundGate, mssqlInboundStream, type InboundGate } from './inbound-budget.js';

/**
 * Microsoft SQL Server.
 * 주의: SQL Server 는 "트랜잭션 읽기전용 모드"가 없다. 따라서 읽기 전용은
 * (1) 정적 가드, (2) 읽기 전용 로그인(필수), (3) 트랜잭션 래핑 후 항상 ROLLBACK
 * 으로 방어한다(엔진 레벨 하드 보장 아님 — README 한계 참고).
 */
export class MssqlDriver implements Driver {
  private readonly poolConfig: sql.config;
  private readonly activePools = new Set<sql.ConnectionPool>();
  private closed = false;

  constructor(private readonly config: AppConfig, private readonly onError: DriverErrorSink = () => {}) {
    const base: sql.config = config.connectionString
      ? sql.ConnectionPool.parseConnectionString(config.connectionString)
      : {
          server: config.host ?? 'localhost',
          port: config.port,
          database: config.database,
          user: config.user,
          password: config.password,
          options: { encrypt: config.ssl, trustServerCertificate: !(config.sslMode === 'verify-ca' || config.sslMode === 'verify-full') },
        };
    this.poolConfig = {
      ...base,
      // A query owns its pool; rollback failures cannot return a suspect session
      // to another caller. This intentionally trades connection reuse for isolation.
      pool: { max: 1, min: 0, idleTimeoutMillis: 30_000 },
      arrayRowMode: false,
      parseJSON: false,
      options: { ...base.options, cancelTimeout: 5000, rowCollectionOnDone: false, rowCollectionOnRequestCompletion: false },
      requestTimeout: config.statementTimeoutMs,
      connectionTimeout: 10_000,
    };
  }

  async ping(): Promise<string> {
    const r = await this.runReadOnly('SELECT @@VERSION AS v', []);
    const v = r.rows[0]?.['v'];
    return typeof v === 'string' ? v.split('\n')[0] ?? 'SQL Server' : 'SQL Server';
  }

  async runReadOnly(sqlText: string, params: readonly unknown[]): Promise<QueryResult> {
    assertRuntimeCompatible('mssql');
    if (this.closed) throw new Error('Driver is closed.');
    if (this.activePools.size >= 4) throw new Error('Database query capacity is exhausted.');
    const connections = new Set<sql.Connection>();
    const terminate = () => {
      for (const connection of connections) {
        try { connection.close(); } catch { /* never replace the query failure */ }
      }
    };
    const pool = new sql.ConnectionPool({
      ...this.poolConfig,
      beforeConnect: (connection) => { connections.add(connection); },
    });
    pool.on('error', () => emitDriverCode(this.onError, 'NLSQL_DB_CONNECTION_LOST'));
    this.activePools.add(pool);
    const started = Date.now();
    let tx: sql.Transaction | undefined;
    let primaryFailed = false;
    let inbound: InboundGate | undefined;
    try {
      await pool.connect();
      tx = new sql.Transaction(pool);
      await tx.begin();
      const request = new sql.Request(tx);
      request.stream = true;
      const budget = new ResultBudget(this.config);
      let firstError: unknown;
      const stop = (error: unknown) => {
        if (firstError) return;
        firstError = error;
        try { request.cancel(); } catch { /* preserve the first collection error */ }
        finally { terminate(); }
      };
      const activeConnections = [...connections].filter((connection) => !connection.closed);
      if (activeConnections.length !== 1) throw new DriverCompatibilityError();
      inbound = installInboundGate(mssqlInboundStream(activeConnections[0]), 'write', this.config.maxInboundBytes ?? DEFAULT_MAX_INBOUND_BYTES, stop);
      request.on('recordset', (columns: Record<string, { index?: number }>) => {
        if (firstError) return;
        try {
          if (Object.getPrototypeOf(columns) !== Object.prototype && Object.getPrototypeOf(columns) !== null) {
            throw new ResultLimitError();
          }
          const fields = Object.keys(columns).sort((a, b) => (columns[a]?.index ?? 0) - (columns[b]?.index ?? 0));
          // node-mssql concatenates FOR JSON/XML chunks even in stream mode.
          // Cancel at metadata, before accepting any of those buffered chunks.
          if (fields.some((field) => field === '__proto__' || field === 'constructor'
            || /^(?:JSON|XML)_F52E2B61-18A1-11d1-B105-00805F49916B$/i.test(field))) {
            throw new ResultLimitError();
          }
          budget.setFields(fields);
        } catch (error) { stop(error); }
      });
      request.on('row', (row: Record<string, unknown>) => {
        if (firstError) return;
        try { budget.addRow(row); } catch (error) { stop(error); }
      });
      request.on('error', (error: Error) => { firstError ??= error; });
      params.forEach((v, i) => request.input(`p${i + 1}`, v));
      // Stream errors can be emitted while query() still resolves. Wait for the
      // terminal callback before rollback, then honor the first failure.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          request.query(sqlText),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              terminate();
              reject(firstError ?? new Error('Database request did not terminate within its deadline.'));
            }, this.config.statementTimeoutMs + Math.min(this.config.statementTimeoutMs, 5000));
          }),
        ]);
      } catch (error) { firstError ??= error; }
      finally { if (timer) clearTimeout(timer); }
      if (firstError) throw firstError;
      return { fields: budget.fields, rows: budget.rows, rowCount: budget.rows.length, elapsedMs: Date.now() - started };
    } catch (error) {
      primaryFailed = true;
      throw inbound?.error ?? error;
    } finally {
      let cleanupError: unknown;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          (async () => {
            if (tx) try { await tx.rollback(); } catch (error) { cleanupError = error; }
            if (!primaryFailed && !cleanupError && inbound && !inbound.error) inbound.restore();
            terminate();
            await pool.close();
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              terminate();
              // Also stop the pool reaper if a broken rollback never settles.
              void pool.close().catch(() => {});
              reject(new Error('Database cleanup did not finish within its deadline.'));
            }, Math.min(this.config.statementTimeoutMs, 5000));
          }),
        ]);
      } catch (error) { cleanupError ??= error; }
      finally { if (timer) clearTimeout(timer); terminate(); }
      // A failed public transport close leaves resource ownership uncertain.
      // Permanently reject new work instead of recycling a concurrency permit.
      if ([...connections].some((connection) => !connection.closed)) {
        this.closed = true;
        cleanupError ??= new Error('Database transport closure could not be confirmed.');
      }
      this.activePools.delete(pool);
      if (!primaryFailed && inbound?.error) throw inbound.error;
      if (!primaryFailed && cleanupError) throw cleanupError;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.activePools].map((pool) => pool.close()));
  }
}
