/**
 * 스키마 인트로스펙션 — NL→SQL 의 "맥락" 제공. information_schema 기반 이식형.
 * postgres/mysql/mssql 공통 뷰(tables/columns/table_constraints/key_column_usage)를 쓰고,
 * 시스템 스키마 제외·FK 조회·LIKE 대소문자만 dialect 로 분기한다.
 */

import type { Driver } from './drivers/types.js';
import type { AppConfig } from './config.js';
import type { Dialect } from './dialect.js';
import {
  assertAllowedSchemasConfigured,
  assertIdentifier,
  assertSchemaAllowed,
} from './schema-policy.js';

function s(v: unknown): string { return v === null || v === undefined ? '' : String(v); }

export interface ColumnInfo {
  column: string; type: string; nullable: boolean; default: string | null; isPrimaryKey: boolean;
}
export interface ForeignKeyInfo {
  constraint: string; columns: string[]; refSchema: string; refTable: string; refColumns: string[];
}
export interface TableInfo {
  schema: string; table: string; columns: ColumnInfo[]; primaryKey: string[]; foreignKeys: ForeignKeyInfo[];
}

export class Introspector {
  constructor(
    private readonly db: Driver,
    private readonly config: AppConfig,
    private readonly d: Dialect,
  ) {}

  /** 허용 스키마 필터를 절+파라미터로. col 은 information_schema 컬럼명. */
  private schemaFilter(col: string, startIdx: number): { clause: string; params: string[] } {
    const allowed = this.config.allowedSchemas;
    assertAllowedSchemasConfigured(allowed);
    const ph = allowed.map((_, k) => this.d.ph(startIdx + k)).join(', ');
    return { clause: `${col} IN (${ph})`, params: [...allowed] };
  }

  private get like(): string { return this.d.name === 'postgres' ? 'ILIKE' : 'LIKE'; }

  async listSchemas(): Promise<{ schema: string; tables: number }[]> {
    const f = this.schemaFilter('table_schema', 1);
    const sql = `SELECT table_schema AS schema_name, COUNT(*) AS tbls
      FROM information_schema.tables WHERE ${f.clause}
      GROUP BY table_schema ORDER BY table_schema`;
    const res = await this.db.runReadOnly(sql, f.params);
    return res.rows
      .map((r) => ({ schema: s(r['schema_name']), tables: Number(r['tbls'] ?? 0) }))
      // Some metadata collations are case-insensitive. Re-check exact names in code.
      .filter((row) => this.config.allowedSchemas.includes(row.schema));
  }

  async listTables(schema: string): Promise<{ table: string; kind: string }[]> {
    assertSchemaAllowed(schema, this.config.allowedSchemas);
    const f = this.schemaFilter('table_schema', 2);
    const sql = `SELECT table_schema AS sch, table_name, table_type FROM information_schema.tables
      WHERE table_schema = ${this.d.ph(1)} AND ${f.clause} ORDER BY table_name`;
    const res = await this.db.runReadOnly(sql, [schema, ...f.params]);
    return res.rows
      .filter((r) => s(r['sch']) === schema)
      .map((r) => ({ table: s(r['table_name']), kind: s(r['table_type']) || 'TABLE' }));
  }

  async describeTable(schema: string, table: string): Promise<TableInfo | null> {
    assertSchemaAllowed(schema, this.config.allowedSchemas);
    assertIdentifier(table);
    const colFilter = this.schemaFilter('table_schema', 3);
    const colSql = `SELECT table_schema AS sch, table_name AS tbl,
                           column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = ${this.d.ph(1)} AND table_name = ${this.d.ph(2)} AND ${colFilter.clause}
      ORDER BY ordinal_position`;
    const cols = await this.db.runReadOnly(colSql, [schema, table, ...colFilter.params]);
    const exactCols = cols.rows.filter((r) => s(r['sch']) === schema && s(r['tbl']) === table);
    if (exactCols.length === 0) return null;

    const pkFilter = this.schemaFilter('tc.table_schema', 3);
    const pkSql = `SELECT tc.table_schema AS sch, tc.table_name AS tbl, kcu.column_name AS col
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema AND kcu.table_name = tc.table_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = ${this.d.ph(1)} AND tc.table_name = ${this.d.ph(2)}
        AND ${pkFilter.clause}
      ORDER BY kcu.ordinal_position`;
    const pk = await this.db.runReadOnly(pkSql, [schema, table, ...pkFilter.params]);
    const pkCols = pk.rows
      .filter((r) => s(r['sch']) === schema && s(r['tbl']) === table)
      .map((r) => s(r['col']));
    const pkSet = new Set(pkCols);

    const fk = await this.foreignKeys(schema, table);

    return {
      schema, table,
      columns: exactCols.map((r) => ({
        column: s(r['column_name']),
        type: s(r['data_type']),
        nullable: s(r['is_nullable']).toUpperCase() === 'YES',
        default: r['column_default'] === null || r['column_default'] === undefined ? null : s(r['column_default']),
        isPrimaryKey: pkSet.has(s(r['column_name'])),
      })),
      primaryKey: pkCols,
      foreignKeys: fk,
    };
  }

  /** FK 조회 — mysql 은 key_column_usage 확장컬럼, pg/mssql 은 constraint_column_usage. */
  private async foreignKeys(schema: string, table: string): Promise<ForeignKeyInfo[]> {
    let sql: string;
    let params: string[];
    const sourceFilter = this.schemaFilter('table_schema', 3);
    const refStart = 3 + sourceFilter.params.length;
    const refFilter = this.schemaFilter('referenced_table_schema', refStart);
    if (this.d.name === 'mysql') {
      sql = `SELECT table_schema AS source_schema, table_name AS source_table,
                    constraint_name AS cn, column_name AS col,
                    referenced_table_schema AS ref_schema, referenced_table_name AS ref_table,
                    referenced_column_name AS ref_col
             FROM information_schema.key_column_usage
             WHERE table_schema = ${this.d.ph(1)} AND table_name = ${this.d.ph(2)}
               AND referenced_table_name IS NOT NULL
               AND ${sourceFilter.clause} AND ${refFilter.clause}
             ORDER BY constraint_name, ordinal_position`;
      params = [schema, table, ...sourceFilter.params, ...refFilter.params];
    } else {
      const source = this.schemaFilter('tc.table_schema', 3);
      const referenced = this.schemaFilter('ccu.table_schema', 3 + source.params.length);
      sql = `SELECT tc.table_schema AS source_schema, tc.table_name AS source_table,
                    tc.constraint_name AS cn, kcu.column_name AS col,
                    ccu.table_schema AS ref_schema, ccu.table_name AS ref_table, ccu.column_name AS ref_col
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
             JOIN information_schema.constraint_column_usage ccu
               ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
             WHERE tc.constraint_type = 'FOREIGN KEY'
               AND tc.table_schema = ${this.d.ph(1)} AND tc.table_name = ${this.d.ph(2)}
               AND ${source.clause} AND ${referenced.clause}
             ORDER BY tc.constraint_name`;
      params = [schema, table, ...source.params, ...referenced.params];
    }
    const res = await this.db.runReadOnly(sql, params);
    const map = new Map<string, ForeignKeyInfo>();
    for (const r of res.rows) {
      if (s(r['source_schema']) !== schema || s(r['source_table']) !== table) continue;
      if (!this.config.allowedSchemas.includes(s(r['ref_schema']))) continue;
      const name = s(r['cn']);
      let info = map.get(name);
      if (!info) {
        info = { constraint: name, columns: [], refSchema: s(r['ref_schema']), refTable: s(r['ref_table']), refColumns: [] };
        map.set(name, info);
      }
      info.columns.push(s(r['col']));
      info.refColumns.push(s(r['ref_col']));
    }
    return [...map.values()];
  }

  /** 키워드로 테이블/컬럼 검색(자연어 용어 매핑). 결과는 코드에서 limit 절단(이식성). */
  async search(keyword: string, limit: number): Promise<{ schema: string; table: string; column: string; type: string }[]> {
    const f = this.schemaFilter('table_schema', 1);
    const likeIdx = f.params.length + 1;
    const like = `%${keyword.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
    const sql = `SELECT table_schema AS sch, table_name AS tbl, column_name AS col, data_type AS typ
      FROM information_schema.columns
      WHERE ${f.clause} AND (table_name ${this.like} ${this.d.ph(likeIdx)} OR column_name ${this.like} ${this.d.ph(likeIdx + 1)})
      ORDER BY table_schema, table_name, ordinal_position`;
    const res = await this.db.runReadOnly(sql, [...f.params, like, like]);
    return res.rows
      .filter((r) => this.config.allowedSchemas.includes(s(r['sch'])))
      .slice(0, limit)
      .map((r) => ({
        schema: s(r['sch']), table: s(r['tbl']), column: s(r['col']), type: s(r['typ']),
      }));
  }
}
