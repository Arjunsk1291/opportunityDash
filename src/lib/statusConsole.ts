type StatusLevel = 'info' | 'success' | 'error';

const shouldLog = () => {
  // Enable via env so production can be quiet by default.
  const raw = String(import.meta.env.VITE_STATUS_LOGS || '').toLowerCase();
  return raw === '1' || raw === 'true';
};

const format = (level: StatusLevel, message: string, meta?: unknown) => {
  const ts = new Date().toISOString();
  const base = `[status] ${ts} ${level.toUpperCase()} ${message}`;
  if (meta === undefined) return base;
  try {
    return `${base} ${JSON.stringify(meta)}`;
  } catch {
    return `${base} [meta-unserializable]`;
  }
};

export const statusConsole = {
  enabled: shouldLog(),

  info(message: string, meta?: unknown) {
    if (!shouldLog()) return;
    // eslint-disable-next-line no-console
    console.log(format('info', message, meta));
  },

  success(message: string, meta?: unknown) {
    if (!shouldLog()) return;
    // eslint-disable-next-line no-console
    console.log(format('success', message, meta));
  },

  error(message: string, meta?: unknown) {
    if (!shouldLog()) return;
    // eslint-disable-next-line no-console
    console.log(format('error', message, meta));
  },
};

