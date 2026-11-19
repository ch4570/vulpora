/** A server-side timeout cannot settle a request on a silent/broken transport. */
export async function withDeadline<T>(work: PromiseLike<T>, timeoutMs: number, terminate: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Database operation exceeded its client deadline.'));
          try { terminate(); } catch { /* keep the authored deadline error */ }
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
