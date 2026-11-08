/**
 * Championship trophy, drawn for the game (no photo): a gold basketball
 * resting on a net-patterned cup on a stepped base, with a soft glow.
 */
export function ChampionshipTrophy({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 260 560" role="img" aria-label="Championship trophy">
      <defs>
        <radialGradient id="tr-glow" cx="50%" cy="40%" r="50%">
          <stop offset="0" stopColor="#ffd25a" stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#ff9f1c" stopOpacity="0.12" />
          <stop offset="1" stopColor="#ff9f1c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="tr-ball" cx="36%" cy="30%" r="72%">
          <stop offset="0" stopColor="#fff8d6" />
          <stop offset="0.18" stopColor="#ffe08a" />
          <stop offset="0.5" stopColor="#e9b23a" />
          <stop offset="0.82" stopColor="#a8741a" />
          <stop offset="1" stopColor="#6e4a0e" />
        </radialGradient>
        <linearGradient id="tr-metal" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#6e4a0e" />
          <stop offset="0.18" stopColor="#c48a24" />
          <stop offset="0.38" stopColor="#ffe9a6" />
          <stop offset="0.5" stopColor="#f6c860" />
          <stop offset="0.72" stopColor="#b57c1c" />
          <stop offset="1" stopColor="#5e3f0a" />
        </linearGradient>
        <linearGradient id="tr-shade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </linearGradient>
        <clipPath id="tr-cup">
          <path d="M72 252 H188 L168 452 H92 Z" />
        </clipPath>
      </defs>

      <ellipse cx="130" cy="230" rx="128" ry="220" fill="url(#tr-glow)" />

      {/* Base */}
      <path d="M58 506 H202 L214 540 H46 Z" fill="url(#tr-metal)" />
      <rect x="46" y="540" width="168" height="14" rx="3" fill="#4a320a" />
      <path d="M78 470 H182 L194 506 H66 Z" fill="url(#tr-metal)" />
      <path d="M78 470 H182 L194 506 H66 Z" fill="url(#tr-shade)" />
      <rect x="86" y="452" width="88" height="20" rx="3" fill="url(#tr-metal)" />

      {/* Cup with the net pattern */}
      <path d="M72 252 H188 L168 452 H92 Z" fill="url(#tr-metal)" />
      <g clipPath="url(#tr-cup)" stroke="#7a520f" strokeWidth="2" opacity="0.55" fill="none">
        {[-120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((x) => (
          <path key={`a${x}`} d={`M${x + 60} 252 L${x + 260} 452`} />
        ))}
        {[-60, -30, 0, 30, 60, 90, 120, 150, 180, 210, 240].map((x) => (
          <path key={`b${x}`} d={`M${x + 60} 252 L${x - 140} 452`} />
        ))}
      </g>
      <path d="M72 252 H188 L168 452 H92 Z" fill="url(#tr-shade)" />
      <path d="M118 256 L114 448" stroke="#fff6cc" strokeWidth="6" opacity="0.45" strokeLinecap="round" />

      {/* Rim of the hoop */}
      <ellipse cx="130" cy="252" rx="62" ry="12" fill="#8c5f12" />
      <ellipse cx="130" cy="249" rx="62" ry="10" fill="none" stroke="url(#tr-metal)" strokeWidth="7" />

      {/* Ball */}
      <circle cx="130" cy="138" r="104" fill="url(#tr-ball)" />
      <g fill="none" stroke="#7a520f" strokeWidth="4" strokeLinecap="round" opacity="0.8">
        <path d="M130 34 C 100 80, 100 196, 130 242" />
        <path d="M27 128 C 80 150, 180 150, 233 128" />
        <path d="M58 64 C 110 92, 112 186, 62 214" />
        <path d="M202 64 C 150 92, 148 186, 198 214" />
      </g>
      <ellipse cx="96" cy="86" rx="30" ry="18" fill="#fffbe6" opacity="0.55" transform="rotate(-28 96 86)" />

      {/* Sparkles */}
      <g fill="#fff3c4">
        <path d="M222 54 l5 14 l14 5 l-14 5 l-5 14 l-5 -14 l-14 -5 l14 -5 z" />
        <path d="M34 214 l3 9 l9 3 l-9 3 l-3 9 l-3 -9 l-9 -3 l9 -3 z" opacity="0.8" />
        <path d="M206 330 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" opacity="0.7" />
      </g>
    </svg>
  );
}
