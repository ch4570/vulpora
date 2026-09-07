/** MCP-independent tool handlers. Keeping protocol registration thin makes the
 * security boundary testable with fake drivers and introspectors. */

import type { AppConfig } from './config.js';
import type { Dialect } from './dialect.js';
import type { Driver } from './drivers/types.js';
import { capRows, rowsToMarkdown } from './format.js';
import { applyLimit, assertReadOnlySelect, SqlGuardError } from './guard.js';
import type { Introspector } from './introspect.js';
import { assertSqlSchemaAccess, SchemaPolicyError, type SchemaPolicyCode } from './schema-policy.js';

export type TextResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

export type StableErrorCode =
  | SchemaPolicyCode
  | 'NLSQL_SQL_REJECTED'
  | 'NLSQL_DB_INTROSPECTION_FAILED'
  | 'NLSQL_DB_QUERY_FAILED'
  | 'NLSQL_DB_EXPLAIN_FAILED'
  | 'NLSQL_INTERNAL_ERROR';

export type ErrorSink = (code: StableErrorCode) => void;

export function textResult(text: string, isError = false): TextResult {
  return { content: [{ type: 'text', text }], isError };
}

const PUBLIC_MESSAGES: Record<StableErrorCode, string> = {
  NLSQL_INVALID_IDENTIFIER: '유효하지 않은 식별자입니다.',
  NLSQL_SCHEMA_NOT_CONFIGURED: '허용 스키마가 설정되지 않았습니다.',
  NLSQL_SCHEMA_DENIED: '허용되지 않은 스키마입니다.',
  NLSQL_SCHEMA_QUALIFICATION_REQUIRED: '물리 테이블은 schema.table 형식으로 지정해야 합니다.',
  NLSQL_SCHEMA_QUERY_UNSUPPORTED: '스키마 접근을 안전하게 검증할 수 없는 SQL 형식입니다.',
  NLSQL_SQL_REJECTED: '읽기 전용 SQL 안전 정책에 의해 거부되었습니다.',
  NLSQL_DB_INTROSPECTION_FAILED: '스키마 정보를 조회하지 못했습니다.',
  NLSQL_DB_QUERY_FAILED: '쿼리를 실행하지 못했습니다.',
  NLSQL_DB_EXPLAIN_FAILED: '실행 계획을 조회하지 못했습니다.',
  NLSQL_INTERNAL_ERROR: '요청을 처리하지 못했습니다.',
};

export function failure(code: StableErrorCode, detail?: string): TextResult {
  const suffix = detail ? ` ${detail}` : '';
  return textResult(`[${code}] ${PUBLIC_MESSAGES[code]}${suffix}`, true);
}

/** Last-resort MCP boundary: unknown exceptions never reach the SDK serializer. */
export async function sanitizeToolCall(
  work: () => Promise<TextResult>,
  onError: ErrorSink,
): Promise<TextResult> {
  try {
    return await work();
  } catch {
    try { onError('NLSQL_INTERNAL_ERROR'); } catch { /* logging must not escape the boundary */ }
    return failure('NLSQL_INTERNAL_ERROR');
  }
}

interface IntrospectionApi {
  listSchemas(): ReturnType<Introspector['listSchemas']>;
  listTables(schema: string): ReturnType<Introspector['listTables']>;
  describeTable(schema: string, table: string): ReturnType<Introspector['describeTable']>;
  search(keyword: string, limit: number): ReturnType<Introspector['search']>;
}

export class ToolService {
  constructor(
    private readonly db: Driver,
    private readonly introspector: IntrospectionApi,
    private readonly config: AppConfig,
    private readonly dialect: Dialect,
    private readonly onError: ErrorSink = () => {},
  ) {}

  private emit(code: StableErrorCode): void {
    try { this.onError(code); } catch { /* logging failures never expose the original error */ }
  }

  private policyFailure(error: unknown): TextResult | null {
    if (error instanceof SchemaPolicyError) {
      this.emit(error.code);
      return failure(error.code);
    }
    if (error instanceof SqlGuardError) {
      this.emit('NLSQL_SQL_REJECTED');
      // Guard messages are authored constants and never contain DB errors or connection details.
      return failure('NLSQL_SQL_REJECTED', error.message);
    }
    return null;
  }

  private async introspection<T>(work: () => Promise<T>): Promise<T | TextResult> {
    try {
      return await work();
    } catch (error) {
      const policy = this.policyFailure(error);
      if (policy) return policy;
      this.emit('NLSQL_DB_INTROSPECTION_FAILED');
      return failure('NLSQL_DB_INTROSPECTION_FAILED');
    }
  }

  async listSchemas(): Promise<TextResult> {
    const result = await this.introspection(() => this.introspector.listSchemas());
    if (!Array.isArray(result)) return result;
    if (result.length === 0) return textResult('조회 가능한 스키마가 없습니다(권한/화이트리스트 확인).');
    return textResult(`## 스키마 (${this.dialect.label})\n` + result.map((r) => `- \`${r.schema}\` — 테이블 ${r.tables}개`).join('\n'));
  }

  async listTables(schema: string): Promise<TextResult> {
    const result = await this.introspection(() => this.introspector.listTables(schema));
    if (!Array.isArray(result)) return result;
    if (result.length === 0) return textResult(`스키마 \`${schema}\` 에 테이블이 없습니다.`);
    return textResult(`## \`${schema}\` 테이블\n` + result.map((t) => `- \`${t.table}\` (${t.kind})`).join('\n'));
  }

  async describeTable(schema: string, table: string): Promise<TextResult> {
    const result = await this.introspection(() => this.introspector.describeTable(schema, table));
    if (result && 'content' in result) return result;
    if (!result) return textResult('테이블을 찾을 수 없습니다.', true);
    const cols = result.columns
      .map((c) => `| ${c.column} | ${c.type} | ${c.nullable ? 'Y' : 'N'} | ${c.default ?? '∅'} | ${c.isPrimaryKey ? 'PK' : ''} |`)
      .join('\n');
    const fks = result.foreignKeys.length
      ? result.foreignKeys.map((f) => `- \`${f.columns.join(', ')}\` → \`${f.refSchema}.${f.refTable}(${f.refColumns.join(', ')})\` (${f.constraint})`).join('\n')
      : '_(없음)_';
    return textResult(
      `## \`${schema}.${table}\` (${this.dialect.label})\n\n` +
        `| 컬럼 | 타입 | NULL | 기본값 | 키 |\n| --- | --- | --- | --- | --- |\n${cols}\n\n` +
        `**PK**: ${result.primaryKey.length ? result.primaryKey.join(', ') : '∅'}\n\n**FK**:\n${fks}`,
    );
  }

  async searchObjects(keyword: string, limit = 50): Promise<TextResult> {
    const result = await this.introspection(() => this.introspector.search(keyword, limit));
    if (!Array.isArray(result)) return result;
    if (result.length === 0) return textResult(`"${keyword}" 와 일치하는 테이블/컬럼이 없습니다.`);
    return textResult(`## "${keyword}" 검색 (${result.length})\n` + result.map((h) => `- \`${h.schema}.${h.table}\`.${h.column} (${h.type})`).join('\n'));
  }

  async runSelect(sql: string, params: readonly unknown[] = []): Promise<TextResult> {
    let guarded;
    try {
      guarded = assertReadOnlySelect(sql, this.dialect);
      assertSqlSchemaAccess(guarded.sql, this.config.allowedSchemas, this.dialect);
    } catch (error) {
      const policy = this.policyFailure(error);
      if (policy) return policy;
      this.emit('NLSQL_SQL_REJECTED');
      return failure('NLSQL_SQL_REJECTED');
    }

    const finalSql = applyLimit(guarded, this.config.maxRows, this.dialect);
    try {
      const res = await this.db.runReadOnly(finalSql, params);
      const { rows, truncatedRows } = capRows(res.rows, this.config.maxRows);
      const table = rowsToMarkdown(res.fields, rows, this.config.maxCellChars);
      const notes = [`행 ${rows.length}개`, `${res.elapsedMs}ms`, this.dialect.label];
      if (truncatedRows || (!guarded.hasLimit && res.rowCount >= this.config.maxRows)) {
        notes.push(`최대 ${this.config.maxRows}행으로 절단됨`);
      }
      return textResult(`${table}\n\n_${notes.join(' · ')}_`);
    } catch {
      this.emit('NLSQL_DB_QUERY_FAILED');
      return failure('NLSQL_DB_QUERY_FAILED');
    }
  }

  async explainSelect(sql: string, params: readonly unknown[] = []): Promise<TextResult> {
    if (this.dialect.name === 'mssql') {
      return textResult('SQL Server 는 explain_select 를 지원하지 않습니다(실행계획은 SSMS에서 확인하세요).', true);
    }

    let guarded;
    try {
      guarded = assertReadOnlySelect(sql, this.dialect);
      assertSqlSchemaAccess(guarded.sql, this.config.allowedSchemas, this.dialect);
    } catch (error) {
      const policy = this.policyFailure(error);
      if (policy) return policy;
      this.emit('NLSQL_SQL_REJECTED');
      return failure('NLSQL_SQL_REJECTED');
    }

    const prefix = this.dialect.name === 'postgres' ? 'EXPLAIN (FORMAT JSON) ' : 'EXPLAIN FORMAT=JSON ';
    try {
      const res = await this.db.runReadOnly(`${prefix}${guarded.sql}`, params);
      const first = res.rows[0] ?? {};
      const planVal = first['QUERY PLAN'] ?? first['EXPLAIN'] ?? first;
      return textResult('```json\n' + JSON.stringify(planVal, null, 2) + '\n```');
    } catch {
      this.emit('NLSQL_DB_EXPLAIN_FAILED');
      return failure('NLSQL_DB_EXPLAIN_FAILED');
    }
  }
}
