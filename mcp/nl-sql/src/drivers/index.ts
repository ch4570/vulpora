import type { AppConfig } from '../config.js';
import type { Driver, DriverErrorSink } from './types.js';
import { PostgresDriver } from './postgres.js';
import { MysqlDriver } from './mysql.js';
import { MssqlDriver } from './mssql.js';
import { assertAllowedSchemasConfigured } from '../schema-policy.js';

export type { Driver, DriverErrorSink, DriverEventCode, QueryResult } from './types.js';

/** config.dialect 에 맞는 드라이버를 생성한다. */
export function createDriver(config: AppConfig, onError: DriverErrorSink = () => {}): Driver {
  // Driver constructors may embed an allowlisted schema in session setup SQL.
  // Validate again here so programmatic callers cannot bypass loadConfig().
  assertAllowedSchemasConfigured(config.allowedSchemas);
  switch (config.dialect) {
    case 'postgres': return new PostgresDriver(config, onError);
    case 'mysql': return new MysqlDriver(config, onError);
    case 'mssql': return new MssqlDriver(config, onError);
  }
}
