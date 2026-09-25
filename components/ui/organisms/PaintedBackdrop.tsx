import { cn } from "@/lib/cn";

/**
 * Painted landscape behind heroes and banners, fading into the page (the Duna "essence").
 * Pure SVG with brush-edge and paper-grain filters, so it is crisp at any size and weighs nothing.
 * Pass `image` to use a real painting instead (put it in public/backdrops/).
 */
export function PaintedBackdrop({
  scene = "meadow",
  image,
  fade = true,
  align = "bottom",
  className,
}: {
  scene?: "meadow" | "sky";
  /** Which part of the painting stays in view when the box is short: the meadow (bottom) or the mountains (middle). */
  align?: "bottom" | "middle";
  image?: string;
  /** Fade the bottom into the page background. */
  fade?: boolean;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" />
      ) : scene === "meadow" ? (
        <Meadow align={align} />
      ) : (
        <Sky />
      )}
      {fade && <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-b from-transparent via-canvas/70 to-canvas" />}
    </div>
  );
}

/** Deterministic pseudo-random numbers so server and client render the same strokes. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Filters({ id }: { id: string }) {
  return (
    <defs>
      <filter id={`${id}-brush`} x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.018 0.045" numOctaves="3" seed="4" />
        <feDisplacementMap in="SourceGraphic" scale="16" />
      </filter>
      <filter id={`${id}-cloud`} x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="9" />
        <feDisplacementMap in="SourceGraphic" scale="46" />
        <feGaussianBlur stdDeviation="5" />
      </filter>
      <filter id={`${id}-grain`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.28  0 0 0 0 0.22  0 0 0 0.55 0" />
      </filter>
    </defs>
  );
}

function Meadow({ align }: { align: "bottom" | "middle" }) {
  const r = rng(7);
  const blades = Array.from({ length: 260 }, () => {
    // Foreground bank on the left, thinning out towards the water.
    const x = r() * 900 - 40;
    const edge = 560 + (x / 900) * 180;
    const y = edge + 30 + r() * (900 - edge);
    const h = 30 + r() * 70;
    const lean = (r() - 0.5) * 30;
    const tone = ["#7c9f4f", "#94b25b", "#a9bf62", "#6d8f47", "#b8c46e"][Math.floor(r() * 5)];
    return { d: `M${x} ${y} q${lean / 2} ${-h / 2} ${lean} ${-h}`, tone, w: 1.2 + r() * 2 };
  });
  const flowers = Array.from({ length: 70 }, () => {
    const x = r() * 820;
    const edge = 580 + (x / 820) * 160;
    return { x, y: edge + 20 + r() * (860 - edge), s: 3 + r() * 5, c: r() > 0.35 ? "#f2a3bd" : "#fff6ec" };
  });
  const reeds = Array.from({ length: 90 }, () => {
    const x = 980 + r() * 640;
    const y = 590 + r() * 40;
    return { d: `M${x} ${y} l${(r() - 0.5) * 8} ${-(14 + r() * 26)}`, tone: r() > 0.5 ? "#d9a45a" : "#c9b15f" };
  });

  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio={align === "bottom" ? "xMidYMax slice" : "xMidYMid slice"} className="size-full">
      <Filters id="m" />
      <defs>
        <linearGradient id="m-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8c4d4" />
          <stop offset="0.28" stopColor="#f3d3c4" />
          <stop offset="0.6" stopColor="#fbc59e" />
        </linearGradient>
        <linearGradient id="m-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c6a6c9" />
          <stop offset="1" stopColor="#e7b8a6" />
        </linearGradient>
        <linearGradient id="m-mid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b98fb8" />
          <stop offset="0.5" stopColor="#d59aa9" />
          <stop offset="1" stopColor="#8fa9b5" />
        </linearGradient>
        <linearGradient id="m-hills" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#efbd6c" />
          <stop offset="1" stopColor="#c8b45d" />
        </linearGradient>
        <linearGradient id="m-lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dcb3c8" />
          <stop offset="0.5" stopColor="#f6c3c1" />
          <stop offset="1" stopColor="#fbe0d6" />
        </linearGradient>
        <linearGradient id="m-bank" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b7c56a" />
          <stop offset="1" stopColor="#7d9f52" />
        </linearGradient>
      </defs>

      <rect width="1600" height="900" fill="url(#m-sky)" />

      <g filter="url(#m-cloud)" opacity="0.9">
        <ellipse cx="260" cy="150" rx="260" ry="70" fill="#fde7d2" />
        <ellipse cx="520" cy="95" rx="200" ry="48" fill="#fff2e2" />
        <ellipse cx="1080" cy="140" rx="300" ry="64" fill="#fcdcc4" />
        <ellipse cx="1420" cy="80" rx="220" ry="52" fill="#fff0de" />
        <ellipse cx="820" cy="250" rx="360" ry="40" fill="#fbd0b4" opacity="0.8" />
      </g>

      <g filter="url(#m-brush)">
        <path d="M0 470 L120 400 L230 330 L330 380 L470 300 L560 340 L700 260 L820 180 L940 250 L1060 300 L1180 250 L1300 300 L1420 250 L1600 330 L1600 520 L0 520Z" fill="url(#m-far)" opacity="0.8" />
        <path d="M-20 520 L180 430 L330 470 L520 370 L640 420 L800 300 L960 410 L1100 380 L1250 430 L1400 390 L1620 450 L1620 560 L-20 560Z" fill="url(#m-mid)" opacity="0.85" />
        <path d="M800 300 L760 360 L800 350 L840 380 L880 360Z" fill="#f0c7d6" opacity="0.6" />
        <path d="M-20 560 C200 470 380 520 520 540 C700 560 840 520 1000 530 C1180 540 1360 500 1620 470 L1620 610 L-20 610Z" fill="url(#m-hills)" />
        <rect y="590" width="1600" height="310" fill="url(#m-lake)" />
      </g>

      {/* Reflections on the water */}
      <g opacity="0.55" filter="url(#m-brush)">
        <path d="M640 620 h320 M700 650 h260 M760 690 h300 M620 730 h200 M880 760 h260" stroke="#fff4ee" strokeWidth="5" strokeLinecap="round" />
        <path d="M700 610 L800 700 L900 610Z" fill="#c9a0c6" opacity="0.5" />
      </g>

      <g filter="url(#m-brush)">
        <path d="M-40 560 C120 560 260 600 400 620 C560 640 700 690 760 760 C800 820 760 900 700 940 L-40 940Z" fill="url(#m-bank)" />
        <path d="M980 600 C1150 580 1350 600 1640 560 L1640 640 C1400 640 1200 630 980 620Z" fill="#c7b762" />
      </g>

      <g strokeLinecap="round" fill="none">
        {blades.map((b, i) => (
          <path key={i} d={b.d} stroke={b.tone} strokeWidth={b.w} opacity="0.85" />
        ))}
        {reeds.map((b, i) => (
          <path key={`r${i}`} d={b.d} stroke={b.tone} strokeWidth="2" opacity="0.8" />
        ))}
      </g>
      {flowers.map((f, i) => (
        <circle key={i} cx={f.x} cy={f.y} r={f.s} fill={f.c} opacity="0.9" />
      ))}

      <g stroke="#3b3330" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.7">
        <path d="M1240 90 q10 -10 18 0 q8 -10 18 0" />
        <path d="M1296 70 q6 -6 11 0 q5 -6 11 0" />
      </g>

      <rect width="1600" height="900" filter="url(#m-grain)" opacity="0.22" style={{ mixBlendMode: "multiply" }} />
    </svg>
  );
}

function Sky() {
  return (
    <svg viewBox="0 0 1600 700" preserveAspectRatio="xMidYMid slice" className="size-full">
      <Filters id="s" />
      <defs>
        <linearGradient id="s-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5f93ae" />
          <stop offset="1" stopColor="#8db6c8" />
        </linearGradient>
      </defs>
      <rect width="1600" height="700" fill="url(#s-sky)" />
      <g filter="url(#s-cloud)">
        <ellipse cx="80" cy="220" rx="220" ry="180" fill="#f4efe4" />
        <ellipse cx="200" cy="520" rx="260" ry="170" fill="#ece6d8" />
        <ellipse cx="-20" cy="640" rx="260" ry="150" fill="#f7f2e8" />
        <ellipse cx="1560" cy="180" rx="240" ry="200" fill="#f4efe4" />
        <ellipse cx="1400" cy="520" rx="280" ry="170" fill="#efe9dc" />
        <ellipse cx="1620" cy="640" rx="240" ry="140" fill="#f7f2e8" />
        <ellipse cx="820" cy="690" rx="320" ry="60" fill="#dfe6e2" opacity="0.6" />
      </g>
      <rect width="1600" height="700" filter="url(#s-grain)" opacity="0.2" style={{ mixBlendMode: "multiply" }} />
    </svg>
  );
}
