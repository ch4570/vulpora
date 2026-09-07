import sql from 'mssql';
import type { AppConfig } from '../config.js';
import { emitDriverCode, type Driver, type DriverErrorSink, type QueryResult } from './types.js';

/**
 * Microsoft SQL Server.
 * 주의: SQL Server 는 "트랜잭션 읽기전용 모드"가 없다. 따라서 읽기 전용은
 * (1) 정적 가드, (2) 읽기 전용 로그인(필수), (3) 트랜잭션 래핑 후 항상 ROLLBACK
 * 으로 방어한다(엔진 레벨 하드 보장 아님 — README 한계 참고).
 */
export class MssqlDriver implements Driver {
  private readonly poolPromise: Promise<sql.ConnectionPool>;

  constructor(config: AppConfig, onError: DriverErrorSink = () => {}) {
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
    const pool = new sql.ConnectionPool({
      ...base,
      pool: { ...base.pool, max: 4, min: 0, idleTimeoutMillis: 30_000 },
      requestTimeout: config.statementTimeoutMs,
      connectionTimeout: 10_000,
    });
    pool.on('error', () => emitDriverCode(onError, 'NLSQL_DB_CONNECTION_LOST'));
    this.poolPromise = pool.connect();
  }

  async ping(): Promise<string> {
    const r = await this.runReadOnly('SELECT @@VERSION AS v', []);
    const v = r.rows[0]?.['v'];
    return typeof v === 'string' ? v.split('\n')[0] ?? 'SQL Server' : 'SQL Server';
  }

  async runReadOnly(sqlText: string, params: readonly unknown[]): Promise<QueryResult> {
    const pool = await this.poolPromise;
    const tx = new sql.Transaction(pool);
    const started = Date.now();
    await tx.begin();
    try {
      const request = new sql.Request(tx);
      params.forEach((v, i) => request.input(`p${i + 1}`, v));
      const result = await request.query(sqlText);
      const rs = result.recordset;
      const cols = (rs?.columns ?? {}) as Record<string, { index?: number }>;
      const fields = Object.keys(cols).sort((a, b) => (cols[a]?.index ?? 0) - (cols[b]?.index ?? 0));
      const rows = (rs ?? []) as unknown as Record<string, unknown>[];
      return { fields, rows, rowCount: rs?.length ?? 0, elapsedMs: Date.now() - started };
    } finally {
      try { await tx.rollback(); } catch { /* 무시 */ }
    }
  }

  async close(): Promise<void> {
    const pool = await this.poolPromise;
    await pool.close();
  }
}
