// Tribunal scales-of-justice mark — glowing blue line art in a hex frame.
// Inline SVG so it scales crisply and inherits currentColor for the scale.

export function TribunalMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="tribunal-scale" x1="32" y1="6" x2="32" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8BC2FF" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      {/* hex frame */}
      <path
        d="M32 3l25 14.5v29L32 61 7 46.5v-29z"
        stroke="#33476B"
        strokeWidth="1.4"
        fill="none"
      />
      {/* scales */}
      <g stroke="url(#tribunal-scale)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* central post */}
        <line x1="32" y1="18" x2="32" y2="46" />
        {/* beam */}
        <line x1="16" y1="22" x2="48" y2="22" />
        {/* base */}
        <line x1="24" y1="48" x2="40" y2="48" />
        {/* left pan */}
        <path d="M16 22l-5 9a5 5 0 0010 0z" />
        {/* right pan */}
        <path d="M48 22l-5 9a5 5 0 0010 0z" />
      </g>
      {/* axis finial / verified dot */}
      <circle cx="32" cy="16" r="3" fill="#8BC2FF" />
    </svg>
  );
}
