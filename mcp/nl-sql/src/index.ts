#!/usr/bin/env node
/**
 * nl-sql MCP 서버 (stdio) — PostgreSQL / MySQL / SQL Server 자연어→SQL 읽기 전용 조회.
 *
 * 자연어→SQL 변환은 호출 LLM 이 한다. 이 MCP 는 ① 스키마 맥락, ② dialect별 안전 실행기를
 * 도구로 제공한다. dialect 는 설정(NLSQL_DIALECT / nl-sql.config.json)으로 1개 고른다.
 *
 * 안전(다층): guard(단일 SELECT/WITH, 금지 키워드·함수, dialect 마스킹)
 *   + 드라이버 읽기전용 트랜잭션(pg/mysql=엔진 보장, mssql=가드+읽기전용 로그인+ROLLBACK)
 *   + statement timeout + 행 하드 캡. 접속은 반드시 읽기 전용 역할로.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// 패키지 디렉터리의 .env 자동 로드(cwd 무관). 이미 설정된 환경변수가 우선(override:false).
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env'), override: false });

import { loadConfig } from './config.js';
import { getDialect } from './dialect.js';
import { createDriver, type DriverEventCode } from './drivers/index.js';
import { Introspector } from './introspect.js';
import { MAX_SQL_CHARS } from './guard.js';
import { IDENTIFIER_PATTERN, SchemaPolicyError } from './schema-policy.js';
import { sanitizeToolCall, ToolService, type StableErrorCode } from './tool-service.js';
import { SERVER_VERSION } from './version.js';

function logCode(code: StableErrorCode | DriverEventCode | 'NLSQL_DB_CONNECTION_FAILED' | 'NLSQL_STARTUP_FAILED'): void {
  process.stderr.write(`[nl-sql] ERROR ${code}\n`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const dialect = getDialect(config.dialect);
  const db = createDriver(config, logCode);
  const introspector = new Introspector(db, config, dialect);
  const tools = new ToolService(db, introspector, config, dialect, logCode);

  try {
    await db.ping();
    process.stderr.write(`[nl-sql] database connection established (${dialect.name})\n`);
    if (!dialect.hardReadOnly) {
      process.stderr.write(`[nl-sql] 주의: ${dialect.label} 는 트랜잭션 읽기전용 모드가 없습니다. 반드시 읽기 전용 로그인으로 접속하세요.\n`);
    }
  } catch {
    logCode('NLSQL_DB_CONNECTION_FAILED');
    await db.close().catch(() => {});
    process.exit(1);
  }

  const server = new McpServer({ name: 'nl-sql', version: SERVER_VERSION });

  const paramHint =
    `이 서버의 dialect=${dialect.label}. 값 바인딩 자리표시자는 ${dialect.placeholderHint} 를 쓰고 params 에 순서대로 넣어라(문자열 연결 금지).`;

  server.registerTool(
    'list_schemas',
    { title: '스키마 목록', description: '조회 가능한 스키마와 테이블 수. NL→SQL 첫 단계.', inputSchema: {} },
    async () => sanitizeToolCall(() => tools.listSchemas(), logCode),
  );

  server.registerTool(
    'list_tables',
    {
      title: '테이블 목록',
      description: '특정 허용 스키마의 테이블/뷰 목록.',
      inputSchema: { schema: z.string().regex(IDENTIFIER_PATTERN).describe('허용 스키마 이름') },
    },
    async ({ schema }) => sanitizeToolCall(() => tools.listTables(schema), logCode),
  );

  server.registerTool(
    'describe_table',
    {
      title: '테이블 상세',
      description: '컬럼(타입/NULL/기본값)·PK·FK 를 반환한다. SQL 작성 전 컬럼명을 정확히 확인할 때.',
      inputSchema: {
        schema: z.string().regex(IDENTIFIER_PATTERN).describe('허용 스키마'),
        table: z.string().regex(IDENTIFIER_PATTERN).describe('테이블'),
      },
    },
    async ({ schema, table }) => sanitizeToolCall(() => tools.describeTable(schema, table), logCode),
  );

  server.registerTool(
    'search_objects',
    {
      title: '객체 검색',
      description: '키워드로 테이블/컬럼 검색(자연어 용어 → 실제 객체 매핑).',
      inputSchema: { keyword: z.string().min(1).max(2_000).describe('검색 키워드'), limit: z.number().int().min(1).max(200).optional().describe('최대 결과(기본 50)') },
    },
    async ({ keyword, limit }) => sanitizeToolCall(() => tools.searchObjects(keyword, limit ?? 50), logCode),
  );

  server.registerTool(
    'run_select',
    {
      title: '읽기 전용 SELECT 실행',
      description:
        `단일 SELECT/WITH 만 읽기 전용으로 실행하고 결과를 Markdown 표로 반환한다. ` +
        `모든 물리 테이블은 허용된 schema.table 로 지정해야 한다. ` +
        `INSERT/UPDATE/DELETE/DDL/다중문장/위험함수는 거부된다. LIMIT 미지정 시 자동 행 캡. ${paramHint}`,
      inputSchema: {
        sql: z.string().min(1).max(MAX_SQL_CHARS).describe(`단일 SELECT 또는 WITH … SELECT (${dialect.label} 문법)`),
        params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).max(1_000).optional().describe(`${dialect.placeholderHint} 에 바인딩할 값(순서대로)`),
      },
    },
    async ({ sql, params }) => sanitizeToolCall(() => tools.runSelect(sql, params ?? []), logCode),
  );

  server.registerTool(
    'explain_select',
    {
      title: '실행계획(EXPLAIN)',
      description: `쿼리를 실행하지 않고 실행계획만 반환한다(pg/mysql). ${dialect.name === 'mssql' ? 'SQL Server 는 미지원.' : ''}`,
      inputSchema: {
        sql: z.string().min(1).max(MAX_SQL_CHARS),
        params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).max(1_000).optional(),
      },
    },
    async ({ sql, params }) => sanitizeToolCall(() => tools.explainSelect(sql, params ?? []), logCode),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[nl-sql] MCP 서버 준비 완료 (stdio, dialect=${dialect.name})\n`);

  const shutdown = async () => { await db.close().catch(() => {}); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  logCode(error instanceof SchemaPolicyError ? error.code : 'NLSQL_STARTUP_FAILED');
  process.exit(1);
});
