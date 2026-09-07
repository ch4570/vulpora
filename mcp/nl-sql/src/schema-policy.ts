/**
 * Schema allowlist policy shared by introspection and user supplied SELECTs.
 *
 * The policy is intentionally conservative: physical relations in run_select /
 * explain_select must be schema-qualified. An unqualified relation depends on a
 * connection's search path/default schema and therefore cannot be proven to stay
 * inside the allowlist. CTE references and relation-free SELECTs remain valid.
 */

import type { Dialect } from './dialect.js';

export const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]{0,127}$/;

export type SchemaPolicyCode =
  | 'NLSQL_INVALID_IDENTIFIER'
  | 'NLSQL_SCHEMA_NOT_CONFIGURED'
  | 'NLSQL_SCHEMA_DENIED'
  | 'NLSQL_SCHEMA_QUALIFICATION_REQUIRED'
  | 'NLSQL_SCHEMA_QUERY_UNSUPPORTED';

export class SchemaPolicyError extends Error {
  override readonly name = 'SchemaPolicyError';

  constructor(readonly code: SchemaPolicyCode, message: string) {
    super(message);
  }
}

/** Validate identifiers accepted from config/tool arguments before any DB call. */
export function assertIdentifier(value: string): string {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw new SchemaPolicyError(
      'NLSQL_INVALID_IDENTIFIER',
      '식별자는 문자 또는 밑줄로 시작하는 128자 이하의 영문·숫자·밑줄·달러 기호만 허용됩니다.',
    );
  }
  return value;
}

/** Empty allowlists never mean "allow everything". */
export function assertAllowedSchemasConfigured(allowedSchemas: readonly string[]): void {
  if (allowedSchemas.length === 0) {
    throw new SchemaPolicyError(
      'NLSQL_SCHEMA_NOT_CONFIGURED',
      'allowedSchemas를 하나 이상 명시해야 합니다.',
    );
  }
  if (allowedSchemas.length > 100) {
    throw new SchemaPolicyError('NLSQL_INVALID_IDENTIFIER', 'allowedSchemas는 최대 100개까지 허용됩니다.');
  }
  const seen = new Set<string>();
  for (const schema of allowedSchemas) {
    assertIdentifier(schema);
    if (seen.has(schema)) {
      throw new SchemaPolicyError('NLSQL_INVALID_IDENTIFIER', 'allowedSchemas에 중복된 이름이 있습니다.');
    }
    seen.add(schema);
  }
}

/** Defense-in-depth check for every introspection entry point. */
export function assertSchemaAllowed(schema: string, allowedSchemas: readonly string[]): void {
  assertIdentifier(schema);
  assertAllowedSchemasConfigured(allowedSchemas);
  if (!allowedSchemas.includes(schema)) {
    throw new SchemaPolicyError('NLSQL_SCHEMA_DENIED', '허용되지 않은 스키마입니다.');
  }
}

interface Token {
  readonly value: string;
  readonly quoted: boolean;
  readonly kind: 'identifier' | 'symbol' | 'literal';
}

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function isKeyword(token: Token | undefined, keyword: string): boolean {
  return token?.kind === 'identifier' && !token.quoted && token.value.toLowerCase() === keyword;
}

function isSymbol(token: Token | undefined, symbol: string): boolean {
  return token?.kind === 'symbol' && token.value === symbol;
}

function unterminated(): never {
  throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', 'SQL 구문을 안전하게 해석할 수 없습니다.');
}

/** Minimal dialect-aware lexer. Literal/comment contents never become identifiers. */
function tokenize(sql: string, d: Dialect): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i]!;
    const next = sql[i + 1] ?? '';

    if (/\s/.test(ch)) { i++; continue; }

    // -- is a MySQL comment only when followed by whitespace/control; # is MySQL-only.
    const mysqlDashComment = d.name !== 'mysql' || /\s/.test(sql[i + 2] ?? '');
    if ((ch === '-' && next === '-' && mysqlDashComment) || (d.name === 'mysql' && ch === '#')) {
      i += ch === '#' ? 1 : 2;
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      // MySQL version comments execute their body. Nested comments also differ by engine.
      const mariaDbExecutable = d.name === 'mysql'
        && (sql[i + 2] === 'm' || sql[i + 2] === 'M')
        && sql[i + 3] === '!';
      if (sql[i + 2] === '!' || sql[i + 2] === '+' || mariaDbExecutable) {
        throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', '실행형 또는 힌트 주석은 허용되지 않습니다.');
      }
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) unterminated();
      const nested = sql.indexOf('/*', i + 2);
      if (nested !== -1 && nested < end) {
        throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', '중첩 블록 주석은 허용되지 않습니다.');
      }
      i = end + 2;
      continue;
    }

    if (ch === "'") {
      let j = i + 1;
      let closed = false;
      const postgresEscapeString = d.name === 'postgres'
        && i > 0
        && (sql[i - 1] === 'e' || sql[i - 1] === 'E')
        && (i < 2 || !/[A-Za-z0-9_$]/.test(sql[i - 2]!));
      while (j < sql.length) {
        if (d.name === 'mysql' && sql[j] === '\\') {
          throw new SchemaPolicyError(
            'NLSQL_SCHEMA_QUERY_UNSUPPORTED',
            'MySQL 문자열의 백슬래시는 params 바인딩을 사용해야 합니다.',
          );
        }
        if (postgresEscapeString && sql[j] === '\\') { j += 2; continue; }
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j++; closed = true; break; }
        j++;
      }
      if (!closed) unterminated();
      tokens.push({ kind: 'literal', value: '', quoted: false });
      i = j;
      continue;
    }

    if (d.dollarQuote && ch === '$') {
      const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (match) {
        const end = sql.indexOf(match[0], i + match[0].length);
        if (end === -1) unterminated();
        tokens.push({ kind: 'literal', value: '', quoted: false });
        i = end + match[0].length;
        continue;
      }
      if (/^\$[A-Za-z0-9_]+\$/.test(sql.slice(i))) {
        throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', '유효하지 않은 달러 인용 태그입니다.');
      }
    }

    const quote = d.identifierQuotes.find(([open]) => open === ch);
    if (quote) {
      const close = quote[1];
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < sql.length) {
        if (sql[j] === close && sql[j + 1] === close) { value += close; j += 2; continue; }
        if (sql[j] === close) { j++; closed = true; break; }
        value += sql[j]!;
        j++;
      }
      if (!closed) unterminated();
      if (!IDENTIFIER_PATTERN.test(value)) {
        throw new SchemaPolicyError('NLSQL_INVALID_IDENTIFIER', 'SQL에 지원하지 않는 식별자가 포함되어 있습니다.');
      }
      tokens.push({ kind: 'identifier', value, quoted: true });
      i = j;
      continue;
    }

    if (isIdentifierStart(ch)) {
      let j = i + 1;
      while (j < sql.length && isIdentifierPart(sql[j]!)) j++;
      tokens.push({ kind: 'identifier', value: sql.slice(i, j), quoted: false });
      i = j;
      continue;
    }

    tokens.push({ kind: 'symbol', value: ch, quoted: false });
    i++;
  }
  return tokens;
}

function canonicalIdentifier(token: Token, d: Dialect): string {
  // PostgreSQL folds unquoted identifiers to lower-case. For other engines exact
  // matching is the fail-closed choice because case-sensitivity is deployment-specific.
  return d.name === 'postgres' && !token.quoted ? token.value.toLowerCase() : token.value;
}

function matchingParen(tokens: readonly Token[], openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i++) {
    if (isSymbol(tokens[i], '(')) depth++;
    else if (isSymbol(tokens[i], ')')) {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', '괄호가 닫히지 않은 SQL입니다.');
}

/** Collect CTE names so unqualified CTE references are not mistaken for DB relations. */
function collectCteNames(tokens: readonly Token[], d: Dialect): Set<string> {
  const names = new Set<string>();
  if (!isKeyword(tokens[0], 'with')) return names;
  let i = isKeyword(tokens[1], 'recursive') ? 2 : 1;

  while (i < tokens.length) {
    const name = tokens[i];
    if (name?.kind !== 'identifier') break;
    names.add(canonicalIdentifier(name, d));
    i++;

    // Optional CTE column list.
    if (isSymbol(tokens[i], '(')) i = matchingParen(tokens, i) + 1;
    if (!isKeyword(tokens[i], 'as')) break;
    i++;
    if (isKeyword(tokens[i], 'not') && isKeyword(tokens[i + 1], 'materialized')) i += 2;
    else if (isKeyword(tokens[i], 'materialized')) i++;
    if (!isSymbol(tokens[i], '(')) break;
    i = matchingParen(tokens, i) + 1;
    if (!isSymbol(tokens[i], ',')) break;
    i++;
  }
  return names;
}

function assertRelation(
  tokens: readonly Token[],
  sourceIndex: number,
  ctes: ReadonlySet<string>,
  allowedSchemas: readonly string[],
  d: Dialect,
): void {
  let i = sourceIndex;
  while (isKeyword(tokens[i], 'only') || isKeyword(tokens[i], 'lateral')) i++;

  if (isSymbol(tokens[i], '(')) {
    const inner = tokens[i + 1];
    // SELECT/WITH/VALUES/TABLE derived queries are scanned independently below.
    if (isKeyword(inner, 'select') || isKeyword(inner, 'with') || isKeyword(inner, 'values') || isKeyword(inner, 'table')) return;
    // Parenthesized relation groups (including ONLY(table)) require a full SQL parser.
    throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', '괄호로 묶은 물리 테이블 표현은 허용되지 않습니다.');
  }
  if (isKeyword(tokens[i], 'values')) return;

  const first = tokens[i];
  if (first?.kind !== 'identifier') {
    throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', 'FROM/JOIN 대상을 안전하게 해석할 수 없습니다.');
  }

  const parts: Token[] = [first];
  i++;
  while (isSymbol(tokens[i], '.')) {
    const part = tokens[i + 1];
    if (part?.kind !== 'identifier') {
      throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', '잘못된 스키마 한정 식별자입니다.');
    }
    parts.push(part);
    i += 2;
  }

  if (isSymbol(tokens[i], '(')) {
    throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', '테이블 반환 함수는 허용되지 않습니다.');
  }

  if (parts.length === 1) {
    if (ctes.has(canonicalIdentifier(first, d))) return;
    throw new SchemaPolicyError(
      'NLSQL_SCHEMA_QUALIFICATION_REQUIRED',
      '물리 테이블은 허용 스키마를 명시해 schema.table 형식으로 조회해야 합니다.',
    );
  }
  if (parts.length !== 2) {
    throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', '교차 데이터베이스 또는 서버 이름은 허용되지 않습니다.');
  }

  const schema = canonicalIdentifier(parts[0]!, d);
  if (!allowedSchemas.includes(schema)) {
    throw new SchemaPolicyError('NLSQL_SCHEMA_DENIED', 'SQL이 허용되지 않은 스키마를 참조합니다.');
  }
}

const FROM_END = new Set([
  'where', 'group', 'having', 'order', 'limit', 'offset', 'fetch', 'union',
  'except', 'intersect', 'window', 'qualify', 'for', 'connect', 'returning',
]);

/** Reject comma joins in one pass: every relation must have an independently checked JOIN token. */
function assertNoCommaSources(tokens: readonly Token[]): void {
  let depth = 0;
  const activeFromDepths = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (isKeyword(token, 'from')) activeFromDepths.add(depth);
    else if (token?.kind === 'identifier' && !token.quoted && FROM_END.has(token.value.toLowerCase())) {
      activeFromDepths.delete(depth);
    } else if (isSymbol(token, ',') && activeFromDepths.has(depth)) {
      throw new SchemaPolicyError(
        'NLSQL_SCHEMA_QUERY_UNSUPPORTED',
        '쉼표 조인은 허용되지 않습니다. 명시적 JOIN을 사용하세요.',
      );
    }

    if (isSymbol(token, '(')) {
      depth++;
    } else if (isSymbol(token, ')')) {
      activeFromDepths.delete(depth);
      depth--;
      if (depth < 0) {
        throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', '괄호가 올바르지 않은 SQL입니다.');
      }
    }
  }
  if (depth !== 0) throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', '괄호가 올바르지 않은 SQL입니다.');
}

function assertFunctionSchema(
  tokens: readonly Token[],
  functionIndex: number,
  allowedSchemas: readonly string[],
  d: Dialect,
): void {
  if (!isSymbol(tokens[functionIndex - 1], '.')) return;
  const schema = tokens[functionIndex - 2];
  if (schema?.kind !== 'identifier') {
    throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', '함수 이름을 안전하게 해석할 수 없습니다.');
  }
  if (isSymbol(tokens[functionIndex - 3], '.')) {
    throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', '교차 데이터베이스 또는 서버 함수는 허용되지 않습니다.');
  }
  if (!allowedSchemas.includes(canonicalIdentifier(schema, d))) {
    throw new SchemaPolicyError('NLSQL_SCHEMA_DENIED', 'SQL이 허용되지 않은 스키마의 함수를 참조합니다.');
  }
}

/**
 * Prove that every physical relation in a guarded SELECT belongs to allowedSchemas.
 * Throws instead of guessing whenever the small parser cannot establish that fact.
 */
export function assertSqlSchemaAccess(sql: string, allowedSchemas: readonly string[], d: Dialect): void {
  assertAllowedSchemasConfigured(allowedSchemas);
  const tokens = tokenize(sql, d);
  const ctes = collectCteNames(tokens, d);
  assertNoCommaSources(tokens);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token?.kind === 'identifier' && isSymbol(tokens[i + 1], '(')) {
      if (d.forbiddenFunctions.includes(token.value.toLowerCase())) {
        throw new SchemaPolicyError('NLSQL_SCHEMA_QUERY_UNSUPPORTED', '금지된 함수 호출이 포함되어 있습니다.');
      }
      assertFunctionSchema(tokens, i, allowedSchemas, d);
    }
    if (isKeyword(token, 'from') || isKeyword(token, 'join') || isKeyword(token, 'apply')) {
      assertRelation(tokens, i + 1, ctes, allowedSchemas, d);
      continue;
    }

    // TABLE schema.name query form. Checking every non-qualified TABLE token is
    // conservative and covers WITH ... TABLE as well as UNION ALL TABLE.
    if (isKeyword(token, 'table') && !isSymbol(tokens[i - 1], '.')) {
      assertRelation(tokens, i + 1, ctes, allowedSchemas, d);
    }
  }
}
