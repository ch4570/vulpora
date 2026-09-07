import mysql from 'mysql2/promise';
import type { AppConfig } from '../config.js';
import { emitDriverCode, type Driver, type DriverErrorSink, type QueryResult } from './types.js';

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

  constructor(config: AppConfig, onError: DriverErrorSink = () => {}) {
    this.timeoutMs = config.statementTimeoutMs;
    this.defaultSchema = config.allowedSchemas[0]!;
    this.pool = mysql.createPool({
      ...(config.connectionString
        ? { uri: config.connectionString }
        : {
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.user,
          password: config.password,
        }),
      ssl: sslOptions(config),
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
    const conn = await this.pool.getConnection();
    const started = Date.now();
    try {
      // Keep unqualified stored-function resolution inside an allowed database.
      await conn.query(`USE \`${this.defaultSchema}\``);
      // SELECT 한정 실행시간 제한(ms). MariaDB 등 미지원이면 무시.
      try { await conn.query(`SET SESSION MAX_EXECUTION_TIME = ${this.timeoutMs}`); } catch { /* 무시 */ }
      await conn.query('START TRANSACTION READ ONLY');
      // Server-side binding keeps values out of SQL text, including when the
      // server enables NO_BACKSLASH_ESCAPES (query() uses client-side escaping).
      const [rows, fields] = await conn.execute({ sql, values: params as unknown[] });
      const list = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
      const names = Array.isArray(fields) ? fields.map((f) => f.name) : [];
      return { fields: names, rows: list, rowCount: list.length, elapsedMs: Date.now() - started };
    } finally {
      try { await conn.query('ROLLBACK'); } catch { /* 무시 */ }
      conn.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
