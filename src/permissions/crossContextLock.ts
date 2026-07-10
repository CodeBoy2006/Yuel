const fallbackTails = new Map<string, Promise<void>>();

/**
 * Web Locks serialize mutations across extension pages and the service worker.
 * The promise queue keeps the same ordering guarantee in test environments that
 * do not expose navigator.locks.
 */
export async function withCrossContextLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const lockManager = globalThis.navigator?.locks;
  if (lockManager) {
    return lockManager.request(name, task);
  }

  const previous = fallbackTails.get(name) ?? Promise.resolve();
  const result = previous.then(task, task);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  fallbackTails.set(name, settled);

  try {
    return await result;
  } finally {
    if (fallbackTails.get(name) === settled) {
      fallbackTails.delete(name);
    }
  }
}
