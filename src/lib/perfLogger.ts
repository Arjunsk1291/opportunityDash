type PerfLogPayload = Record<string, unknown>;

export function perfLog(event: string, payload: PerfLogPayload = {}) {
  const ts = new Date().toISOString();
  const safeEvent = String(event || 'event').trim();
  try {
    console.log(`[perf] ${ts} ${safeEvent}`, payload);
  } catch {
    // ignore
  }
}

export async function withPerf<T>(
  event: string,
  payload: PerfLogPayload,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  perfLog(`${event}.start`, payload);
  try {
    const result = await fn();
    perfLog(`${event}.success`, { ...payload, ms: Math.round(performance.now() - startedAt) });
    return result;
  } catch (error) {
    perfLog(`${event}.error`, {
      ...payload,
      ms: Math.round(performance.now() - startedAt),
      message: (error as Error)?.message || String(error),
    });
    throw error;
  }
}

