/**
 * 결과 포매팅 — 행 하드 캡, 셀 절단, Markdown 표 렌더.
 * 실제 드라이버는 수집 단계에서 행·바이트 한도를 적용한다. 이 절단은 출력 단계의 보조 방어다.
 */

export interface Capped {
  readonly rows: readonly Record<string, unknown>[];
  readonly truncatedRows: boolean;
}

/** 반환 행을 maxRows 로 절단. 초과 시 플래그. */
export function capRows(rows: readonly Record<string, unknown>[], maxRows: number): Capped {
  if (rows.length <= maxRows) return { rows, truncatedRows: false };
  return { rows: rows.slice(0, maxRows), truncatedRows: true };
}

function cell(value: unknown, maxChars: number): string {
  if (value === null || value === undefined) return '∅';
  let s: string;
  if (typeof value === 'bigint') s = value.toString();
  else if (value instanceof Date) s = value.toISOString();
  else if (typeof value === 'object') {
    // bigint 포함 객체(jsonb/composite)에서 JSON.stringify 가 던지는 것을 방지.
    try { s = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)); }
    catch { s = String(value); }
  } else s = String(value);
  // Markdown 표 깨짐 방지 + 과대 셀 절단.
  s = s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
  if (s.length > maxChars) s = s.slice(0, maxChars) + `…(+${s.length - maxChars})`;
  return s;
}

/** rows → Markdown 표. fields 순서를 유지한다. */
export function rowsToMarkdown(
  fields: readonly string[],
  rows: readonly Record<string, unknown>[],
  maxCellChars: number,
): string {
  if (fields.length === 0) return '_(컬럼 없음)_';
  if (rows.length === 0) return `_(행 0개)_ — 컬럼: ${fields.join(', ')}`;
  const header = `| ${fields.join(' | ')} |`;
  const sep = `| ${fields.map(() => '---').join(' | ')} |`;
  const body = rows
    .map((r) => `| ${fields.map((f) => cell(r[f], maxCellChars)).join(' | ')} |`)
    .join('\n');
  return `${header}\n${sep}\n${body}`;
}
