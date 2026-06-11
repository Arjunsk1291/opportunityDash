import { useEffect, useState } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { Rocket } from 'lucide-react';

// Scroll-driven "journey" layer: a gradient progress bar across the top of the
// viewport plus a rocket that rides down a track on the right edge as you
// scroll. Transform-only animations so it never causes layout/jank, and it
// hides itself entirely on pages that don't scroll.
export function ScrollJourney() {
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 24, mass: 0.4 });

  // Rocket travels down a track that spans most of the viewport height.
  const rocketY = useTransform(progress, [0, 1], ['0vh', '72vh']);
  const rocketTilt = useTransform(progress, [0, 0.5, 1], [0, 6, 0]);
  const pctText = useTransform(scrollYProgress, (v) => `${Math.round(v * 100)}`);

  const [scrollable, setScrollable] = useState(false);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const check = () => {
      setScrollable(document.documentElement.scrollHeight - window.innerHeight > 160);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(document.documentElement);
    window.addEventListener('resize', check);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', check);
    };
  }, []);

  useEffect(() => pctText.on('change', (v) => setPct(Number(v))), [pctText]);

  if (prefersReducedMotion || !scrollable) return null;

  return (
    <>
      {/* Top scroll progress bar */}
      <motion.div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-primary via-sky-400 to-emerald-400"
        style={{ scaleX: progress }}
        aria-hidden
      />

      {/* Right-edge rocket track */}
      <div className="pointer-events-none fixed right-1.5 top-[14vh] z-[55] hidden h-[76vh] w-8 md:block" aria-hidden>
        <div className="absolute right-[13px] top-0 h-full w-px bg-gradient-to-b from-transparent via-border to-transparent" />
        <motion.div className="absolute right-0 top-0 flex w-8 flex-col items-center" style={{ y: rocketY }}>
          {/* exhaust trail (rocket flies nose-down, so the trail sits above it) */}
          <motion.span
            className="mb-0.5 h-3 w-[3px] origin-bottom rounded-full bg-gradient-to-t from-orange-400/90 to-transparent"
            animate={{ scaleY: [1, 1.6, 1], opacity: [0.9, 0.5, 0.9] }}
            transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            style={{ rotate: rocketTilt }}
            animate={{ x: [0, -1.5, 0, 1.5, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="relative"
          >
            <span className="absolute inset-0 -z-10 rounded-full bg-primary/30 blur-md" />
            <Rocket className="h-5 w-5 rotate-180 text-primary drop-shadow" />
          </motion.div>
          <span className="mt-1 select-none text-[9px] font-semibold tabular-nums text-muted-foreground">
            {pct}%
          </span>
        </motion.div>
      </div>
    </>
  );
}
