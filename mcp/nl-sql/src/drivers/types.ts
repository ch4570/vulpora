/** 드라이버 공통 인터페이스 — dialect별 구현이 이걸 만족한다. */

export interface QueryResult {
  readonly fields: readonly string[];
  readonly rows: readonly Record<string, unknown>[];
  readonly rowCount: number;
  readonly elapsedMs: number;
}

/** Stable code emitted for asynchronous driver errors; never accepts the raw Error. */
export type DriverEventCode = 'NLSQL_DB_CONNECTION_LOST';
export type DriverErrorSink = (code: DriverEventCode) => void;

export function emitDriverCode(sink: DriverErrorSink, code: DriverEventCode): void {
  try { sink(code); } catch { /* diagnostics must never surface a raw driver exception */ }
}

export interface Driver {
  /** 부팅 연결 확인 — 버전 문자열 반환. 실패 시 throw(비밀 미포함). */
  ping(): Promise<string>;
  /**
   * 가드+LIMIT 처리를 마친 단일 SELECT/WITH 를 읽기 전용으로 실행한다.
   * 파라미터는 dialect 자리표시자에 순서대로 바인딩된다($1 / ? / @p1).
   */
  runReadOnly(sql: string, params: readonly unknown[]): Promise<QueryResult>;
  close(): Promise<void>;
}
