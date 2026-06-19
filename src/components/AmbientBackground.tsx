// Page-level ambient color blobs that live behind all content. These are what make
// the glass surfaces (backdrop-filter: blur) actually read as glass — a blurred panel
// over a flat background is optically invisible, so the blobs must carry real color
// variation. Geometry/opacity mirror the design mockup (rgba .30–.42) rather than the
// barely-there 5–7% the first re-skin shipped. Dimmed slightly in dark mode.
export function AmbientBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-100 dark:opacity-60"
      aria-hidden
    >
      <div
        className="ambient-orb absolute rounded-full"
        style={{
          top: '-180px',
          left: '6%',
          width: '540px',
          height: '540px',
          background: 'radial-gradient(circle, rgba(47,107,255,0.42), transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        className="ambient-orb-slow absolute rounded-full"
        style={{
          top: '26%',
          right: '-130px',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(16,179,163,0.40), transparent 70%)',
          filter: 'blur(44px)',
        }}
      />
      <div
        className="ambient-orb-rev absolute rounded-full"
        style={{
          bottom: '-200px',
          left: '34%',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(139,92,246,0.30), transparent 70%)',
          filter: 'blur(52px)',
        }}
      />
    </div>
  );
}
