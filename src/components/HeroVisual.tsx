import './HeroVisual.css';

const EDGE_ACCENT_DOTS = (() => {
  const dots: Array<{ cx: number; cy: number }> = [];
  for (let row = 0; row < 67; row += 1) {
    for (let column = 0; column < 67; column += 1) {
      const cx = column * 15 + 7.5;
      const cy = row * 15 + 7.5;
      const distance = Math.hypot(cx - 500, cy - 500);
      const sample = Math.sin((row + 1) * 127.1 + (column + 1) * 311.7) * 43758.5453;
      const selection = sample - Math.floor(sample);
      if (distance >= 405 && distance <= 485 && selection < 0.25) {
        dots.push({ cx, cy });
      }
    }
  }
  return dots;
})();

/** A single dot field shaded from a dark core to a silver outer edge. */
function SilverGlobe() {
  return (
    <svg className="hv-globe" viewBox="0 0 1000 1000" focusable="false">
      <defs>
        <pattern id="hv-silver-dots" width="15" height="15" patternUnits="userSpaceOnUse">
          <circle cx="7.5" cy="7.5" r="3.2" fill="white" />
        </pattern>
        <mask id="hv-globe-mask">
          <circle cx="500" cy="500" r="492" fill="url(#hv-silver-dots)" />
        </mask>
        <radialGradient id="hv-silver-shade" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#23262b" />
          <stop offset="38%" stopColor="#454950" />
          <stop offset="70%" stopColor="#868b93" />
          <stop offset="100%" stopColor="#c9ccd2" />
        </radialGradient>
      </defs>
      <circle cx="500" cy="500" r="492" fill="url(#hv-silver-shade)" mask="url(#hv-globe-mask)" />
      <g className="hv-edge-accents">
        {EDGE_ACCENT_DOTS.map(({ cx, cy }) => (
          <circle className="hv-edge-accent" key={`${cx}-${cy}`} cx={cx} cy={cy} r="4.2" />
        ))}
      </g>
    </svg>
  );
}

/** Decorative silver dot-matrix globe fixed in the hero's upper-right corner. */
export function HeroVisual() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <SilverGlobe />
    </div>
  );
}
