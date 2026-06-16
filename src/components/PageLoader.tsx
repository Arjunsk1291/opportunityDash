import { motion } from 'framer-motion';

// Suspense fallback shown while a lazy route chunk downloads.
export function PageLoader() {
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
      </div>
      <p className="text-sm text-muted-foreground">Loading page…</p>
    </div>
  );
}
