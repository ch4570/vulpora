import { resetAll } from './cache.js';
import { createApplicationContext } from './bootstrap.js';

export function installCleanupHooks(hooks) {
  let applicationContext;
  hooks.beforeAll(async () => {
    applicationContext = await createApplicationContext();
  });
  hooks.afterEach(async () => {
    await resetAll(applicationContext.redis, applicationContext.databaseCleanup);
    await applicationContext.executeResetSql();
  });
  hooks.afterAll(async () => {
    await applicationContext?.close();
  });
}
