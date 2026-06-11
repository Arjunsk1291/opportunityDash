import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface AsyncActionOptions<T, P> {
  // Actions may call reportProgress(0-100) to drive the bar with real
  // progress; once called, the simulated ramp stops permanently.
  action: (params: P, reportProgress?: (pct: number) => void) => Promise<T>;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
  successMessage?: string | ((result: T) => string);
  errorMessage?: string | ((error: Error) => string);
  loadingMessage?: string;
}

export function useAsyncAction<T, P = void>(options: AsyncActionOptions<T, P>) {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const execute = useCallback(async (params: P) => {
    setIsLoading(true);
    setProgress(0);

    // Fake progress steps if no real progress is available from the action
    let hasRealProgress = false;
    const interval = setInterval(() => {
      if (hasRealProgress) return;
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.floor(Math.random() * 10) + 5;
      });
    }, 400);

    const reportProgress = (pct: number) => {
      hasRealProgress = true;
      setProgress(Math.max(0, Math.min(100, pct)));
    };

    try {
      const result = await options.action(params, reportProgress);
      clearInterval(interval);
      setProgress(100);

      const msg = typeof options.successMessage === 'function'
        ? options.successMessage(result)
        : options.successMessage;

      if (msg) toast.success(msg);
      options.onSuccess?.(result);
      return result;
    } catch (error) {
      clearInterval(interval);
      setProgress(0);
      const err = error as Error;

      const msg = typeof options.errorMessage === 'function'
        ? options.errorMessage(err)
        : options.errorMessage || err.message;

      toast.error(msg);
      options.onError?.(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  return { execute, isLoading, progress };
}
