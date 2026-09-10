export async function resetCache(redis) {
  await redis.sendCommand(['FLUSHDB']);
}

export async function resetEveryDatabase(redis) {
  await redis.sendCommand(['FLUSHALL']);
}

export async function removeCachedEntries(redis) {
  // Incremental discovery does not bound ownership when the match is global.
  for await (const key of redis.scanIterator({ MATCH: '*' })) {
    await redis.sendCommand(['DEL', key]);
  }
}

export async function resetAll(redis, databaseCleanup) {
  await databaseCleanup.resetAll();
  await resetCache(redis);
  await resetEveryDatabase(redis);
  await removeCachedEntries(redis);
}
