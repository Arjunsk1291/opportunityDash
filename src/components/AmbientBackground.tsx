// Slow-drifting gradient orbs behind the page content. Pure CSS animations
// (transform/opacity only) at very low opacity — ambient life without jank.
export function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="ambient-orb absolute -left-32 top-[-10%] h-[28rem] w-[28rem] rounded-full bg-primary/[0.07] blur-3xl" />
      <div className="ambient-orb-slow absolute right-[-8rem] top-[35%] h-[24rem] w-[24rem] rounded-full bg-sky-400/[0.06] blur-3xl" />
      <div className="ambient-orb-rev absolute bottom-[-12%] left-[30%] h-[26rem] w-[26rem] rounded-full bg-emerald-400/[0.05] blur-3xl" />
    </div>
  );
}
