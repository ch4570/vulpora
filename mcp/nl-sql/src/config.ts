/**
 * 설정 로딩 — JSON 설정 파일 + 환경 변수. 부팅 시 1회 검증한다.
 *
 * 우선순위(높은 쪽이 이김): 환경변수(process.env: .mcp.json env / 셸 export / .env)
 *   > JSON 설정 파일(nl-sql.config.json 또는 NLSQL_CONFIG 경로) > 기본값.
 * → 읽기 좋은 JSON 한 파일에 다 적어도 되고, 비밀만 환경변수로 덮어써도 된다.
 *
 * 비밀(연결정보)은 절대 로그/툴 응답에 싣지 않는다.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDialect, isDialectName, type DialectName } from './dialect.js';
import { assertAllowedSchemasConfigured } from './schema-policy.js';

export interface AppConfig {
  /** 대상 DB 종류. 드라이버·문법 선택의 기준. */
  readonly dialect: DialectName;
  /** 연결 문자열(pg/mysql). 없으면 개별 필드. mssql 은 개별 필드 권장. */
  readonly connectionString?: string;
  readonly host?: string;
  readonly port?: number;
  readonly database?: string;
  readonly user?: string;
  readonly password?: string;
  readonly ssl: boolean;
  /** 원시 SSL 모드(require/verify-ca/verify-full/disable …) — TLS 검증 강도 결정. */
  readonly sslMode: string;
  /** 단일 응답 하드 캡(행). */
  readonly maxRows: number;
  /** 드라이버가 보관할 결과의 논리적 바이트 예산. 디코더의 셀 할당은 별도. */
  readonly maxResultBytes: number;
  /** 사용자 쿼리 파서에 전달할 수신 청크 바이트 한도. */
  readonly maxInboundBytes: number;
  /** 쿼리당 statement timeout(ms). */
  readonly statementTimeoutMs: number;
  /** 조회 허용 스키마. 공개 안전 기본값을 위해 반드시 하나 이상 필요하다. */
  readonly allowedSchemas: readonly string[];
  /** 셀 값 출력 시 최대 문자 수. */
  readonly maxCellChars: number;
}

/** JSON 설정 파일 스키마(모든 필드 선택). 가독성 위해 limits 를 중첩한다. */
interface FileConfig {
  dialect?: string;
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  /** "disable"|"allow"|"prefer"|"require"|"verify-ca"|"verify-full" 또는 boolean. */
  ssl?: string | boolean;
  allowedSchemas?: string[];
  limits?: {
    maxRows?: number;
    maxResultBytes?: number;
    maxInboundBytes?: number;
    statementTimeoutMs?: number;
    maxCellChars?: number;
  };
}

/** 패키지 디렉터리(dist/ 의 부모) 기준 기본 JSON 설정 경로. */
function defaultConfigPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../nl-sql.config.json');
}

/**
 * JSON 설정 파일을 읽는다.
 * - NLSQL_CONFIG 가 지정됐는데 파일이 없으면 에러(오타 가드).
 * - 미지정이면 기본 경로가 있을 때만 읽고, 없으면 빈 설정.
 */
function readFileConfig(): FileConfig {
  const explicit = process.env.NLSQL_CONFIG?.trim();
  const path = explicit && explicit.length > 0 ? explicit : defaultConfigPath();

  if (!existsSync(path)) {
    if (explicit) throw new Error(`NLSQL_CONFIG 가 가리키는 설정 파일이 없습니다: ${path}`);
    return {};
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    throw new Error(`설정 파일을 읽을 수 없습니다(${path}): ${(e as Error).message}`);
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('최상위가 JSON 객체여야 합니다.');
    }
    return parsed as FileConfig;
  } catch (e) {
    throw new Error(`설정 파일 JSON 파싱 실패(${path}): ${(e as Error).message}`);
  }
}

/** env > file > undefined (문자열). 빈 문자열은 미설정 취급. */
function str(envName: string, fileVal: string | undefined): string | undefined {
  const env = process.env[envName];
  if (env !== undefined && env.trim() !== '') return env;
  if (fileVal !== undefined && String(fileVal).trim() !== '') return String(fileVal);
  return undefined;
}

/** env > file > fallback (정수, 범위 검증). */
function int(
  envName: string,
  fileVal: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  let n: number;
  const env = process.env[envName];
  if (env !== undefined && env.trim() !== '') {
    n = Number.parseInt(env, 10);
    if (!Number.isFinite(n)) throw new Error(`${envName} 는 정수여야 합니다(받음: ${JSON.stringify(env)}).`);
  } else if (fileVal !== undefined) {
    if (typeof fileVal !== 'number' || !Number.isFinite(fileVal)) {
      throw new Error(`설정 ${envName} 에 해당하는 JSON 값은 숫자여야 합니다(받음: ${JSON.stringify(fileVal)}).`);
    }
    n = Math.trunc(fileVal);
  } else {
    return fallback;
  }
  if (n < min || n > max) throw new Error(`${envName} 는 ${min}..${max} 범위여야 합니다(받음: ${n}).`);
  return n;
}

/** SSL 모드 문자열/boolean → TLS 강제 여부. env PGSSLMODE > file.ssl. */
function resolveSsl(fileSsl: string | boolean | undefined): boolean {
  const envMode = process.env.PGSSLMODE?.toLowerCase();
  const mode = envMode && envMode.trim() !== '' ? envMode : fileSsl;
  if (typeof mode === 'boolean') return mode;
  const m = (mode ?? '').toString().toLowerCase();
  // disable/allow/prefer 는 평문 허용 → false, require/verify-* 는 TLS 강제.
  return m === 'require' || m === 'verify-ca' || m === 'verify-full' || m === 'true';
}

/** 원시 SSL 모드 문자열. env PGSSLMODE > file.ssl. 드라이버의 인증서 검증 결정에 사용. */
function resolveSslMode(fileSsl: string | boolean | undefined): string {
  const envMode = process.env.PGSSLMODE?.toLowerCase();
  const mode = envMode && envMode.trim() !== '' ? envMode : fileSsl;
  if (typeof mode === 'boolean') return mode ? 'require' : 'disable';
  return (mode ?? '').toString().toLowerCase();
}

/** env CSV > file 배열 > []. */
function schemas(fileVal: string[] | undefined): string[] {
  const env = process.env.NLSQL_ALLOWED_SCHEMAS;
  if (env && env.trim() !== '') {
    return env.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  }
  if (Array.isArray(fileVal)) return fileVal.map((s) => String(s).trim()).filter((s) => s.length > 0);
  return [];
}

function resolveDialect(fileVal: string | undefined): DialectName {
  const raw = (str('NLSQL_DIALECT', fileVal) ?? 'postgres').toLowerCase();
  if (!isDialectName(raw)) {
    throw new Error(`dialect 는 postgres|mysql|mssql 중 하나여야 합니다(받음: ${JSON.stringify(raw)}).`);
  }
  return raw;
}

export function loadConfig(): AppConfig {
  const file = readFileConfig();
  const limits = file.limits ?? {};

  const dialect = resolveDialect(file.dialect);
  const dialectDef = getDialect(dialect);

  const connectionString = str('PG_CONNECTION_STRING', file.connectionString);
  const host = str('PGHOST', file.host);
  const database = str('PGDATABASE', file.database);

  if (!connectionString && !host && !database) {
    throw new Error(
      'DB 연결 정보가 없습니다. nl-sql.config.json(dialect + connectionString 또는 host/database/user) ' +
        '또는 환경변수(NLSQL_DIALECT, PG_CONNECTION_STRING / PGHOST·PGDATABASE·PGUSER)를 설정하세요. ' +
        '예시: nl-sql.config.example.json / .env.example',
    );
  }

  const portStr = str('PGPORT', file.port === undefined ? undefined : String(file.port));
  const port = portStr ? Number.parseInt(portStr, 10) : connectionString ? undefined : dialectDef.defaultPort;

  const allowedSchemas = schemas(file.allowedSchemas);
  assertAllowedSchemasConfigured(allowedSchemas);

  return {
    dialect,
    connectionString,
    host,
    port,
    database,
    user: str('PGUSER', file.user),
    password: str('PGPASSWORD', file.password),
    ssl: resolveSsl(file.ssl),
    sslMode: resolveSslMode(file.ssl),
    maxRows: int('NLSQL_MAX_ROWS', limits.maxRows, 100, 1, 10_000),
    maxResultBytes: int('NLSQL_MAX_RESULT_BYTES', limits.maxResultBytes, 1_048_576, 1024, 67_108_864),
    maxInboundBytes: int('NLSQL_MAX_INBOUND_BYTES', limits.maxInboundBytes, 4_194_304, 1024, 33_554_432),
    statementTimeoutMs: int('NLSQL_STATEMENT_TIMEOUT_MS', limits.statementTimeoutMs, 5_000, 100, 120_000),
    allowedSchemas,
    maxCellChars: int('NLSQL_MAX_CELL_CHARS', limits.maxCellChars, 2_000, 16, 1_000_000),
  };
}
