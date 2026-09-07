/**
 * Dialect 기술자 — postgres / mysql / mssql 의 문법·실행 차이를 한 곳에 모은다.
 * 드라이버(drivers/*)와 가드(guard.ts)·인트로스펙션(introspect.ts)이 이 표를 참조한다.
 */

export type DialectName = 'postgres' | 'mysql' | 'mssql';

export interface Dialect {
  readonly name: DialectName;
  readonly label: string;
  readonly defaultPort: number;
  /** i번째(1-base) 파라미터 자리표시자. */
  ph(i: number): string;
  /** 모델에게 안내할 자리표시자 예시(툴 설명에 노출). */
  readonly placeholderHint: string;
  /** 식별자 따옴표 문자쌍들(마스킹용). */
  readonly identifierQuotes: ReadonlyArray<readonly [string, string]>;
  /** 라인 주석 토큰. */
  readonly lineComments: readonly string[];
  /** 문자열에서 백슬래시 escape 를 해석하는가(mysql=true). */
  readonly backslashEscapes: boolean;
  /** 달러 인용($tag$) 지원(postgres=true). */
  readonly dollarQuote: boolean;
  /** 엔진 레벨 읽기전용 트랜잭션을 보장하는가(pg/mysql=true, mssql=false). */
  readonly hardReadOnly: boolean;
  /** 외곽 LIMIT 주입 가능(pg/mysql). mssql 은 TOP/OFFSET 이라 주입하지 않음. */
  readonly canAppendLimit: boolean;
  /** dialect 고유 금지 함수/구문(소문자, 단어 경계 검사). */
  readonly forbiddenFunctions: readonly string[];
  /** 인트로스펙션에서 제외할 시스템 스키마. */
  readonly systemSchemas: readonly string[];
}

const POSTGRES: Dialect = {
  name: 'postgres',
  label: 'PostgreSQL',
  defaultPort: 5432,
  ph: (i) => `$${i}`,
  placeholderHint: '$1, $2 …',
  identifierQuotes: [['"', '"']],
  lineComments: ['--'],
  backslashEscapes: false,
  dollarQuote: true,
  hardReadOnly: true,
  canAppendLimit: true,
  forbiddenFunctions: [
    'pg_read_file', 'pg_read_binary_file', 'pg_ls_dir', 'pg_stat_file',
    'lo_import', 'lo_export', 'lo_get', 'lo_put',
    'dblink', 'dblink_exec', 'dblink_connect', 'dblink_connect_u',
    'dblink_disconnect', 'dblink_open', 'dblink_close', 'dblink_fetch',
    'dblink_send_query', 'dblink_get_result', 'dblink_is_busy',
    'dblink_cancel_query', 'dblink_get_notify', 'dblink_error_message',
    'dblink_get_connections',
    'pg_sleep', 'pg_terminate_backend', 'pg_cancel_backend', 'pg_reload_conf',
    'pg_notify', 'pg_export_snapshot', 'set_config', 'nextval', 'setval',
    'query_to_xml', 'query_to_xmlschema', 'cursor_to_xml', 'cursor_to_xmlschema',
    'database_to_xml', 'database_to_xmlschema', 'schema_to_xml',
    'schema_to_xmlschema', 'table_to_xml', 'table_to_xmlschema',
    'pg_advisory_lock', 'pg_advisory_xact_lock', 'pg_try_advisory_lock',
    'pg_advisory_lock_shared', 'pg_advisory_xact_lock_shared',
    'pg_try_advisory_lock_shared', 'pg_try_advisory_xact_lock',
    'pg_try_advisory_xact_lock_shared', 'pg_advisory_unlock',
    'pg_advisory_unlock_shared', 'pg_advisory_unlock_all',
  ],
  systemSchemas: ['pg_catalog', 'information_schema', 'pg_toast'],
};

const MYSQL: Dialect = {
  name: 'mysql',
  label: 'MySQL',
  defaultPort: 3306,
  ph: () => '?',
  placeholderHint: '? (순서대로)',
  identifierQuotes: [['"', '"'], ['`', '`']],
  lineComments: ['--', '#'],
  backslashEscapes: true,
  dollarQuote: false,
  hardReadOnly: true,
  canAppendLimit: true,
  forbiddenFunctions: [
    'load_file', 'sys_exec', 'sys_eval', 'benchmark', 'sleep', 'get_lock',
    'release_lock', 'master_pos_wait', 'outfile', 'dumpfile',
  ],
  systemSchemas: ['mysql', 'information_schema', 'performance_schema', 'sys'],
};

const MSSQL: Dialect = {
  name: 'mssql',
  label: 'Microsoft SQL Server',
  defaultPort: 1433,
  ph: (i) => `@p${i}`,
  placeholderHint: '@p1, @p2 …',
  identifierQuotes: [['"', '"'], ['[', ']']],
  lineComments: ['--'],
  backslashEscapes: false,
  dollarQuote: false,
  hardReadOnly: false, // 트랜잭션 읽기전용 모드 없음 — 가드+읽기전용 로그인+ROLLBACK 으로 방어
  canAppendLimit: false, // LIMIT 미지원 — TOP/OFFSET. 외곽 주입 안 함(결과 캡으로 보장)
  forbiddenFunctions: [
    'xp_cmdshell', 'xp_dirtree', 'xp_fileexist', 'xp_regread',
    'openrowset', 'opendatasource', 'openquery', 'openxml',
    'waitfor', 'sp_executesql', 'sp_oacreate', 'bulk',
    'updlock', 'xlock', 'holdlock', 'tablock', 'tablockx', 'rowlock', 'paglock',
  ],
  systemSchemas: ['sys', 'information_schema', 'guest', 'db_owner', 'db_accessadmin',
    'db_securityadmin', 'db_ddladmin', 'db_backupoperator', 'db_datareader',
    'db_datawriter', 'db_denydatareader', 'db_denydatawriter'],
};

const REGISTRY: Record<DialectName, Dialect> = { postgres: POSTGRES, mysql: MYSQL, mssql: MSSQL };

export function getDialect(name: DialectName): Dialect {
  return REGISTRY[name];
}

export function isDialectName(s: string): s is DialectName {
  return s === 'postgres' || s === 'mysql' || s === 'mssql';
}
