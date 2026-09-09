/**
 * SQL 안전 가드 — 읽기 전용(SELECT/WITH) 단일 문장만 통과시킨다. Dialect 인지.
 *
 * 다층 방어의 1차(빠른 거부). 하드 보장은 드라이버의 읽기전용 트랜잭션이다
 * (postgres/mysql=엔진 보장, mssql=가드+읽기전용 로그인+ROLLBACK). 가드만 믿지 않는다.
 *
 * 접근: 문자열/식별자 따옴표/주석/(pg)달러인용을 dialect 규칙대로 공백 마스킹한 뒤,
 * 마스킹 텍스트에서만 키워드/세미콜론을 검사한다 → 데이터 값의 키워드 오탐 방지.
 */

import type { Dialect } from './dialect.js';

export class SqlGuardError extends Error {
  override readonly name = 'SqlGuardError';
}

export const MAX_SQL_CHARS = 50_000;

/** 쿼리 중간(데이터 변경 CTE·SELECT INTO)에 끼어들 수 있는 공통 DML/DDL 동사. */
const FORBIDDEN_KEYWORDS = [
  'insert', 'update', 'delete', 'merge', 'upsert', 'truncate',
  'drop', 'create', 'alter', 'grant', 'revoke', 'copy', 'into',
  'call', 'execute', 'exec', 'prepare', 'deallocate', 'lock', 'unlock',
  'replace', 'load',
];

/**
 * dialect 규칙대로 문자열/주석/따옴표 식별자를 마스킹(길이 보존).
 * 기본값은 공백; 절 탐지용 옵션은 인용 atom만 ?로 표시하고 주석은 공백으로 둔다.
 */
export function maskLiterals(sql: string, d: Dialect, preserveQuotedAtoms = false): string {
  // MySQL's byte lexer distinguishes its EOF sentinel from an embedded NUL.
  // Do not guess at NUL inside comments/literals; bind such data via params.
  if (d.name === 'mysql' && sql.includes('\0')) {
    throw new SqlGuardError('MySQL SQL 텍스트의 NUL은 허용되지 않습니다. params 바인딩을 사용하세요.');
  }
  const out: string[] = [];
  let i = 0;
  const n = sql.length;
  const push = (count: number, quotedAtom = false) => out.push(
    quotedAtom && preserveQuotedAtoms ? '?' + ' '.repeat(count - 1) : ' '.repeat(count),
  );

  while (i < n) {
    const ch = sql[i]!;
    const next = i + 1 < n ? sql[i + 1] : '';

    // 라인 주석 (-- 항상, # 은 mysql). MySQL의 -- 는 뒤에 공백/제어문자가 필요하다.
    let matchedLine = false;
    for (const tok of d.lineComments) {
      // MySQL checks one byte: ASCII space/control or the EOF sentinel, not
      // JavaScript Unicode whitespace (e.g. NBSP is an identifier byte).
      const mysqlDashComment = d.name !== 'mysql' || tok !== '--'
        || i + tok.length === n || /[\x01-\x20\x7f]/.test(sql[i + tok.length] ?? '');
      if (sql.startsWith(tok, i) && mysqlDashComment) {
        let j = i + tok.length;
        // PostgreSQL/SQL Server also end -- at CR; MySQL scans through to LF.
        while (j < n && sql[j] !== '\n' && (d.name === 'mysql' || sql[j] !== '\r')) j++;
        push(j - i);
        i = j;
        matchedLine = true;
        break;
      }
    }
    if (matchedLine) continue;

    // 실행형 MySQL version comment / optimizer hint는 내용이 실행될 수 있어 전부 거부.
    // 중첩 주석은 엔진별 파싱 차이가 커서 마스킹 우회 방지를 위해 거부한다.
    if (ch === '/' && next === '*') {
      const mariaDbExecutable = d.name === 'mysql'
        && (sql[i + 2] === 'm' || sql[i + 2] === 'M')
        && sql[i + 3] === '!';
      if (sql[i + 2] === '!' || sql[i + 2] === '+' || mariaDbExecutable) {
        throw new SqlGuardError('실행형 또는 힌트 주석은 허용되지 않습니다.');
      }
      let j = i + 2;
      let closed = false;
      while (j < n) {
        if (sql[j] === '/' && sql[j + 1] === '*') {
          throw new SqlGuardError('중첩 블록 주석은 허용되지 않습니다.');
        }
        if (sql[j] === '*' && sql[j + 1] === '/') { j += 2; closed = true; break; }
        j++;
      }
      if (!closed) throw new SqlGuardError('닫히지 않은 블록 주석입니다.');
      push(j - i);
      i = j;
      continue;
    }

    // 작은따옴표 문자열 (''  이중, mysql 은 \\ escape)
    if (ch === "'") {
      let j = i + 1;
      let closed = false;
      const postgresEscapeString = d.name === 'postgres'
        && i > 0
        && (sql[i - 1] === 'e' || sql[i - 1] === 'E')
        && (i < 2 || !/[A-Za-z0-9_$]/.test(sql[i - 2]!));
      while (j < n) {
        if (d.name === 'mysql' && sql[j] === '\\') {
          // NO_BACKSLASH_ESCAPES changes parsing. Reject ambiguity instead of guessing.
          throw new SqlGuardError('MySQL 문자열의 백슬래시는 허용되지 않습니다. params 바인딩을 사용하세요.');
        }
        if (postgresEscapeString && sql[j] === '\\') { j += 2; continue; }
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j++; closed = true; break; }
        j++;
      }
      if (!closed) throw new SqlGuardError('닫히지 않은 문자열 리터럴입니다.');
      push(j - i, true);
      i = j;
      continue;
    }

    // 식별자 따옴표쌍: "x" / `x`(mysql) / [x](mssql). 같은 닫힘문자 이중은 escape.
    let matchedQuote = false;
    for (const [open, close] of d.identifierQuotes) {
      if (ch === open) {
        let j = i + 1;
        let closed = false;
        while (j < n) {
          if (sql[j] === close && sql[j + 1] === close) { j += 2; continue; }
          if (sql[j] === close) { j++; closed = true; break; }
          j++;
        }
        if (!closed) throw new SqlGuardError('닫히지 않은 따옴표 식별자입니다.');
        push(j - i, true);
        i = j;
        matchedQuote = true;
        break;
      }
    }
    if (matchedQuote) continue;

    // 달러 인용 $tag$ … $tag$ (postgres)
    // PostgreSQL scan.l permits non-ASCII tag characters. A delimiter cannot
    // start inside an unquoted identifier (including identifier$tag$ suffixes).
    if (d.dollarQuote && ch === '$'
      && (i === 0 || !/[A-Za-z0-9_$\u0080-\uffff]/.test(sql[i - 1]!))) {
      const tagMatch = /^\$(?:[A-Za-z_\u0080-\uffff][A-Za-z0-9_\u0080-\uffff]*)?\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) throw new SqlGuardError('닫히지 않은 달러 인용 문자열입니다.');
        const stop = end + tag.length;
        push(stop - i, true);
        i = stop;
        continue;
      }
      if (/^\$[A-Za-z0-9_\u0080-\uffff]+\$/.test(sql.slice(i))) {
        throw new SqlGuardError('유효하지 않은 달러 인용 태그입니다.');
      }
    }

    out.push(ch);
    i++;
  }
  return out.join('');
}

function statementCount(maskedSql: string): number {
  return maskedSql.split(';').map((s) => s.trim()).filter((s) => s.length > 0).length;
}

function hasWord(maskedLower: string, word: string): boolean {
  const re = new RegExp(`(^|[^a-z0-9_])${word}([^a-z0-9_]|$)`, 'i');
  return re.test(maskedLower);
}

/** Nested SELECT/CTE limits do not bound the rows returned by the outer query. */
function hasOuterLimit(maskedLower: string, d: Dialect): boolean {
  // MySQL also permits dollar/digit-prefixed identifiers. Keep the complete
  // identifier-shaped run so $limit and 123limit cannot become LIMIT clauses.
  const tokens = maskedLower.match(/@@?[a-z0-9_$.\u0080-\uffff]*|[a-z0-9_$\u0080-\uffff]+|[^\s]/g) ?? [];
  const openings: number[] = [];
  const closing = new Map<number, number>();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '(') openings.push(i);
    else if (tokens[i] === ')') {
      const opening = openings.pop();
      if (opening !== undefined) closing.set(opening, i);
    }
  }
  let start = 0;
  let end = tokens.length;
  // Only unwrap parentheses enclosing the entire query, never one UNION arm.
  // A single matching pass keeps arbitrarily deep input linear, not quadratic.
  while (tokens[start] === '(' && closing.get(start) === end - 1) { start++; end--; }
  let depth = 0;
  let hasTop = false;
  let hasSetOperation = false;
  for (let i = start; i < end; i++) {
    const token = tokens[i]!;
    if (token === '(') { depth++; continue; }
    if (token === ')') { depth--; continue; }
    if (depth !== 0) continue;

    const previous = tokens[i - 1];
    // Qualified names and explicit output aliases are not clauses.
    if (previous === '.' || previous === 'as') continue;
    if (d.canAppendLimit && token === 'limit') return true;
    if (d.name !== 'mysql' && token === 'fetch'
      && (tokens[i + 1] === 'first' || tokens[i + 1] === 'next')) return true;
    if (d.name === 'mssql') {
      if (token === 'union' || token === 'intersect' || token === 'except') hasSetOperation = true;
      const afterSelect = previous === 'select'
        || ((previous === 'all' || previous === 'distinct') && tokens[i - 2] === 'select');
      if (token === 'top' && afterSelect
        && (tokens[i + 1] === '(' || /^[0-9]+$/.test(tokens[i + 1] ?? ''))) hasTop = true;
    }
  }
  // TOP limits a SELECT operand, not the combined result of a set operation.
  return hasTop && !hasSetOperation;
}

export interface GuardOk {
  readonly sql: string;
  readonly hasLimit: boolean;
  readonly isCte: boolean;
}

/** 읽기 전용 단일 SELECT/WITH 검증. 위반 시 SqlGuardError. */
export function assertReadOnlySelect(rawSql: string, d: Dialect): GuardOk {
  // PG/MySQL non-ASCII whitespace can belong to an identifier. Preserve it for
  // schema validation instead of changing a trailing table name before checking.
  const trimSql = (value: string) => d.name === 'mssql'
    ? value.trim() : value.replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, '');
  if (typeof rawSql !== 'string' || trimSql(rawSql) === '') {
    throw new SqlGuardError('빈 쿼리입니다.');
  }
  if (rawSql.length > MAX_SQL_CHARS) {
    throw new SqlGuardError(`SQL은 최대 ${MAX_SQL_CHARS}자까지 허용됩니다.`);
  }
  const trailingTerminators = d.name === 'mssql' ? /;[\s;]*$/g : /;[ \t\n\r\f\v;]*$/g;
  let sql = trimSql(trimSql(rawSql).replace(trailingTerminators, ''));
  if (sql === '') throw new SqlGuardError('빈 쿼리입니다.');

  // Preserve each quoted atom's position, not its content. Otherwise AS "x"
  // LIMIT would look like the output alias AS LIMIT to the clause detector.
  const masked = maskLiterals(sql, d, true);
  const maskedLower = masked.toLowerCase();

  if (statementCount(masked) > 1) {
    throw new SqlGuardError('여러 문장을 한 번에 보낼 수 없습니다. 단일 SELECT만 허용됩니다.');
  }

  const firstWord = (maskedLower.match(/[a-z_]+/) ?? [''])[0];
  const isCte = firstWord === 'with';
  if (firstWord !== 'select' && firstWord !== 'with' && firstWord !== 'table' && firstWord !== 'values') {
    throw new SqlGuardError(`읽기 전용 SELECT/WITH 만 허용됩니다(시작 토큰: ${firstWord || '없음'}).`);
  }

  for (const kw of FORBIDDEN_KEYWORDS) {
    if (hasWord(maskedLower, kw)) {
      throw new SqlGuardError(`금지된 키워드가 포함되어 거부합니다: ${kw.toUpperCase()}`);
    }
  }
  for (const fn of d.forbiddenFunctions) {
    if (hasWord(maskedLower, fn)) {
      throw new SqlGuardError(`금지된 함수/구문이 포함되어 거부합니다(${d.label}): ${fn}`);
    }
  }

  // 행 잠금 절은 읽기 전용에서 부적절(경합/락). FOR UPDATE 는 'update' 키워드로도 막히나 명시 차단.
  if (/(^|[^a-z0-9_])for\s+(update|no\s+key\s+update|share|key\s+share)\b/i.test(maskedLower)) {
    throw new SqlGuardError('행 잠금 절(FOR UPDATE/SHARE/KEY SHARE 등)은 읽기 전용에서 허용되지 않습니다.');
  }
  if (d.name === 'mssql' && /\bnext\s+value\s+for\b/i.test(maskedLower)) {
    throw new SqlGuardError('SQL Server 시퀀스 값 생성(NEXT VALUE FOR)은 허용되지 않습니다.');
  }

  const hasLimit = hasOuterLimit(maskedLower, d);

  return { sql, hasLimit, isCte };
}

/**
 * LIMIT 보강. pg/mysql 은 외곽 LIMIT 부재 시 ` LIMIT n` 추가.
 * mssql 은 LIMIT 미지원(TOP/OFFSET) → 변경하지 않고 결과 캡(format.capRows)으로 보장.
 * 어느 경우든 행 수 하드 캡은 결과 절단이 보장한다.
 */
export function applyLimit(guard: GuardOk, maxRows: number, d: Dialect): string {
  if (!d.canAppendLimit || guard.hasLimit) return guard.sql;
  return `${guard.sql}\nLIMIT ${maxRows}`;
}
