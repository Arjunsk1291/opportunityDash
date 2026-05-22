import { useEffect, useRef, useState } from 'react';

type Options = {
  startAt?: number;
  capAt?: number;
  stepMs?: number;
};

// UI-only progress for async actions where backend does not provide true %.
// Ramps up to capAt and finishes at 100 when you set active=false.
export function useProgressLoader(active: boolean, options: Options = {}) {
  const startAt = options.startAt ?? 8;
  const capAt = options.capAt ?? 92;
  const stepMs = options.stepMs ?? 120;

  const [pct, setPct] = useState(0);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      setPct((prev) => (prev > 0 ? prev : startAt));
      const startTime = Date.now();
      let warned = false;
      const id = window.setInterval(() => {
        setPct((prev) => {
          if (prev >= 98) return prev;
          if (prev >= capAt) {
            if (!warned && Date.now() - startTime > 5000) {
              console.warn(`[useProgressLoader] Progress stayed ≥${capAt}% for longer than 5s.`, {
                options,
                route: window.location.pathname
              });
              warned = true;
            }
            // Continue very slowly past capAt up to 98
            return Math.min(prev + 0.1, 98);
          }
          const next = prev + Math.max(1, Math.round((capAt - prev) * 0.08));
          return Math.min(next, capAt);
        });
      }, stepMs);
      return () => window.clearInterval(id);
    }

    if (!wasActiveRef.current) return;
    // finish animation
    setPct(100);
    const doneId = window.setTimeout(() => {
      setPct(0);
      wasActiveRef.current = false;
    }, 350);
    return () => window.clearTimeout(doneId);
  }, [active, capAt, startAt, stepMs, options]);

  return pct;
}

