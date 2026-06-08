import { useState } from 'react';

export interface TrackedActionStatus {
  name: string;
  percent: number;
  detail: string;
}

export function useTrackedAction() {
  const [status, setStatus] = useState<TrackedActionStatus | null>(null);

  const run = async <T>(
    name: string,
    fn: (setProgress: (pct: number, detail?: string) => void) => Promise<T>,
  ): Promise<T> => {
    setStatus({ name, percent: 5, detail: 'Starting…' });

    const fakeTimer = setInterval(() => {
      setStatus((cur) => {
        if (!cur || cur.name !== name || cur.percent >= 85) return cur;
        const bump = Math.max(0.5, (85 - cur.percent) * 0.08);
        return { ...cur, percent: Math.min(85, Math.round((cur.percent + bump) * 10) / 10) };
      });
    }, 350);

    try {
      const result = await fn((pct, detail = '') =>
        setStatus({ name, percent: Math.min(100, Math.round(pct)), detail }),
      );
      clearInterval(fakeTimer);
      setStatus({ name, percent: 100, detail: 'Done' });
      setTimeout(
        () => setStatus((cur) => (cur?.name === name ? null : cur)),
        2200,
      );
      return result;
    } catch (e) {
      clearInterval(fakeTimer);
      setStatus({ name, percent: 100, detail: `Failed: ${(e as Error).message}` });
      setTimeout(
        () => setStatus((cur) => (cur?.name === name ? null : cur)),
        2200,
      );
      throw e;
    }
  };

  return { status, run };
}
