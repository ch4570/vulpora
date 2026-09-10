import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Duplex, Writable } from 'node:stream';
import type { DialectName } from '../dialect.js';
import { ResultLimitError } from './result-budget.js';

const require = createRequire(import.meta.url);
export const DEFAULT_MAX_INBOUND_BYTES = 4_194_304;

export class DriverCompatibilityError extends Error {
  override readonly name = 'DriverCompatibilityError';
  readonly code = 'NLSQL_DRIVER_UNSUPPORTED';
  constructor() { super('Unsupported database driver version or inbound transport shape.'); }
}

// These private transport locations were inspected and exercised with the
// installed lockfile. An upgrade requires rerunning the fragmented-parser tests.
const COMPATIBLE: Record<DialectName, Record<string, string>> = {
  postgres: { pg: '8.23.0', 'pg-protocol': '1.16.0' },
  mysql: { mysql2: '3.24.3' },
  mssql: { mssql: '12.7.0', tedious: '20.0.0' },
};

export function assertCompatibleVersions(dialect: DialectName, versions: Record<string, string>): void {
  for (const [name, version] of Object.entries(COMPATIBLE[dialect])) {
    if (versions[name] !== version) throw new DriverCompatibilityError();
  }
}

function packageVersion(name: string, resolver: NodeJS.Require): string {
  let directory = dirname(resolver.resolve(name));
  for (let depth = 0; depth < 8; depth++) {
    try {
      const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { name?: string; version?: string };
      if (metadata.name === name && typeof metadata.version === 'string') return metadata.version;
    } catch { /* the resolved entry may be under lib/ or dist/ */ }
    directory = dirname(directory);
  }
  throw new DriverCompatibilityError();
}

export function assertRuntimeCompatible(dialect: DialectName): void {
  try {
    const primary = dialect === 'postgres' ? 'pg' : dialect === 'mysql' ? 'mysql2' : 'mssql';
    const dependencyRequire = createRequire(require.resolve(primary));
    const versions: Record<string, string> = {};
    for (const name of Object.keys(COMPATIBLE[dialect])) {
      versions[name] = packageVersion(name, name === primary ? require : dependencyRequire);
    }
    assertCompatibleVersions(dialect, versions);
  } catch { throw new DriverCompatibilityError(); }
}

export interface InboundGate {
  readonly acceptedBytes: number;
  readonly error: Error | undefined;
  restore(): void;
}

/** Admit only complete chunks within budget, before an existing parser listener. */
export function installInboundGate(
  target: unknown, method: 'emit' | 'write', maxBytes: number, onViolation: (error: Error) => void,
): InboundGate {
  if (!(target instanceof Writable) || (method === 'emit' && (!(target instanceof Duplex) || target.readableEncoding !== null))
    || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 33_554_432) throw new DriverCompatibilityError();
  const descriptor = Object.getOwnPropertyDescriptor(target, method);
  if ((descriptor && (!('value' in descriptor) || !descriptor.configurable))
    || (!descriptor && !Object.isExtensible(target))) throw new DriverCompatibilityError();
  const original = target[method];
  if (typeof original !== 'function') throw new DriverCompatibilityError();
  let acceptedBytes = 0;
  let error: Error | undefined;
  const wrapped = function (this: unknown, ...args: unknown[]): unknown {
    if (method === 'write' || args[0] === 'data') {
      if (error) return false;
      const chunk = args[method === 'emit' ? 1 : 0];
      if (!(chunk instanceof Uint8Array)) error = new DriverCompatibilityError();
      else if (chunk.byteLength > maxBytes - acceptedBytes) error = new ResultLimitError();
      if (error) {
        // Latch before calling code which can synchronously re-enter emit/write.
        try { onViolation(error); } catch { /* event handlers must never throw */ }
        return false;
      }
      acceptedBytes += (chunk as Uint8Array).byteLength;
    }
    return Reflect.apply(original, this, args);
  };
  Object.defineProperty(target, method, { value: wrapped, writable: true, configurable: true, enumerable: descriptor?.enumerable ?? false });
  return {
    get acceptedBytes() { return acceptedBytes; },
    get error() { return error; },
    restore() {
      if (error) throw error;
      if (target[method] !== wrapped) throw new DriverCompatibilityError();
      if (descriptor) Object.defineProperty(target, method, descriptor);
      else Reflect.deleteProperty(target, method);
    },
  };
}

export function postgresInboundStream(client: unknown): Duplex {
  const stream = (client as { connection?: { stream?: unknown } })?.connection?.stream;
  if (!(stream instanceof Duplex)) throw new DriverCompatibilityError();
  return stream;
}

export function mysqlInboundStream(core: unknown): Duplex {
  const connection = core as { config?: { compress?: unknown }; stream?: unknown };
  if (connection?.config?.compress !== false || !(connection.stream instanceof Duplex)) throw new DriverCompatibilityError();
  return connection.stream;
}

export function mssqlInboundStream(connection: unknown): Writable {
  const stream = (connection as { messageIo?: { incomingMessageStream?: unknown } })?.messageIo?.incomingMessageStream;
  const tediousRequire = createRequire(require.resolve('mssql'));
  const entry = tediousRequire.resolve('tedious');
  const Incoming = tediousRequire(join(dirname(entry), 'incoming-message-stream.js')) as typeof Writable;
  if (!(stream instanceof Incoming)) throw new DriverCompatibilityError();
  return stream;
}
