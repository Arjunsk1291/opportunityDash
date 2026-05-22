type DiagEntry =
  | { tag: 'DIAG_NAV_START'; ts: string; path: string }
  | { tag: 'DIAG_NAV_PAINT'; ts: string; path: string; frameMs: number }
  | { tag: 'DIAG_FETCH_START'; ts: string; id: string; method: string; url: string }
  | { tag: 'DIAG_FETCH_FINISH'; ts: string; id: string; method: string; url: string; status: number | null; ok: boolean | null; elapsedMs: number };

const isEnabled = () => String(import.meta.env.VITE_DIAG_LOGS || '').toLowerCase() === '1' || String(import.meta.env.VITE_DIAG_LOGS || '').toLowerCase() === 'true';

const state = {
  entries: [] as DiagEntry[],
  navPath: '' as string,
  navStartedAt: 0,
};

const push = (entry: DiagEntry) => {
  state.entries.push(entry);
  // Keep console logs easy to grep/paste.
  // eslint-disable-next-line no-console
  console.log('[diag]', entry);
};

export const diag = {
  enabled: isEnabled(),

  navStart(path: string) {
    if (!diag.enabled) return;
    state.entries = [];
    state.navPath = path;
    state.navStartedAt = performance.now();
    push({ tag: 'DIAG_NAV_START', ts: new Date().toISOString(), path });
  },

  navPaint(path: string) {
    if (!diag.enabled) return;
    const frameMs = Math.round((performance.now() - state.navStartedAt) * 100) / 100;
    push({ tag: 'DIAG_NAV_PAINT', ts: new Date().toISOString(), path, frameMs });
  },

  installFetchPatch() {
    if (!diag.enabled) return;
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __diagFetchInstalled?: boolean };
    if (w.__diagFetchInstalled) return;
    w.__diagFetchInstalled = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const startedAt = performance.now();
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const method = (init?.method || 'GET').toUpperCase();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

      push({ tag: 'DIAG_FETCH_START', ts: new Date().toISOString(), id, method, url });

      try {
        const res = await originalFetch(input as any, init);
        const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
        push({
          tag: 'DIAG_FETCH_FINISH',
          ts: new Date().toISOString(),
          id,
          method,
          url,
          status: res.status,
          ok: res.ok,
          elapsedMs,
        });
        return res;
      } catch (err) {
        const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
        push({
          tag: 'DIAG_FETCH_FINISH',
          ts: new Date().toISOString(),
          id,
          method,
          url,
          status: null,
          ok: null,
          elapsedMs,
        });
        throw err;
      }
    };
  },

  installFinishCommand() {
    if (!diag.enabled) return;
    if (typeof window === 'undefined') return;

    const w = window as any;
    if (typeof w.diagFinish === 'function') return;
    w.diagFinish = () => {
      // eslint-disable-next-line no-console
      console.log('[diag] DIAG_FINISH', {
        ts: new Date().toISOString(),
        path: state.navPath,
        entries: state.entries,
      });
    };
  },
};

