import { motion } from 'framer-motion';
import { useProgressLoader } from '@/lib/useProgressLoader';

// Suspense fallback shown while a lazy route chunk downloads.
// Shows a live 0-100% counter so the page never feels frozen.
export function PageLoader() {
  const pct = useProgressLoader(true, { startAt: 12, capAt: 90, stepMs: 90 });

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
      <div className="relative h-20 w-20">
        <motion.span
          className="absolute inset-0 rounded-full border-4 border-muted"
          aria-hidden
        />
        <motion.span
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          aria-hidden
        />
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-foreground">
          {Math.round(pct)}%
        </span>
      </div>
      <div className="w-56">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          />
        </div>
        <motion.p
          className="mt-3 text-center text-xs text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Loading page…
        </motion.p>
      </div>
    </div>
  );
}
