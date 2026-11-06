import { useState, type ReactNode } from 'react';
import type { ImageCredit, Team } from '../engine';
import { attrTone, ovrTone } from './format';

/** Generated team crest: a shield in the team's colors with its abbreviation. */
export function TeamBadge({ team, size = 40 }: { team: Pick<Team, 'abbrev' | 'colors'> & { logo?: ImageCredit }; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (team.logo && !broken) {
    return (
      <span className="crest logo-img" style={{ width: size, height: Math.round(size * 1.15) }}>
        <img src={team.logo.url} alt="" loading="lazy" onError={() => setBroken(true)} />
      </span>
    );
  }
  const { primary, secondary } = team.colors;
  const text = team.abbrev.length > 3 ? 11 : 13;
  return (
    <svg className="crest" width={size} height={Math.round(size * 1.15)} viewBox="0 0 40 46" aria-hidden="true">
      <path d="M20 1.5 L37.5 7.5 V22 C37.5 33.5 30 40.5 20 44.5 C10 40.5 2.5 33.5 2.5 22 V7.5 Z" fill={primary} stroke={secondary} strokeWidth="2.5" />
      <path d="M20 6 L33 10.5 V22 C33 30.5 27.5 36 20 39.5" fill="none" stroke={secondary} strokeOpacity="0.35" strokeWidth="1" />
      <text x="20" y="27.5" textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize={text} fill={secondary} letterSpacing="0.3">
        {team.abbrev}
      </text>
    </svg>
  );
}

/** A player's free-licensed photo, or the jersey figure when there is none. */
export function PlayerPhoto({ photo, number, colors, className }: { photo?: ImageCredit; number: number | string; colors: { primary: string; secondary: string }; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (photo && !broken) {
    return <img className={`photo ${className ?? ''}`} src={photo.url} alt="" loading="lazy" onError={() => setBroken(true)} />;
  }
  return (
    <span className={`photo photo-figure ${className ?? ''}`}>
      <PlayerFigure number={number} colors={colors} size={120} />
    </span>
  );
}

/** Credit line required by the image's license. */
export function ImageCreditLine({ label, image }: { label: string; image?: ImageCredit }) {
  if (!image) return null;
  return (
    <p className="credit">
      {label}: {image.credit} ·{' '}
      <a href={image.sourceUrl} target="_blank" rel="noreferrer noopener">
        {image.license}, {image.source}
      </a>
    </p>
  );
}

/** Generated player figure wearing the team jersey and number. */
export function PlayerFigure({ number, colors, size = 104, tone = '#2b3550' }: { number: number | string; colors: { primary: string; secondary: string }; size?: number; tone?: string }) {
  return (
    <svg className="figure" width={size} height={Math.round(size * 0.88)} viewBox="0 0 120 106" aria-hidden="true">
      <circle cx="60" cy="30" r="19" fill={tone} />
      <path d="M6 106 Q8 66 40 54 Q60 64 80 54 Q112 66 114 106 Z" fill={tone} />
      <path d="M28 106 L30 70 Q34 58 46 53 Q60 70 74 53 Q86 58 90 70 L92 106 Z" fill={colors.secondary} />
      <path d="M46 53 Q60 70 74 53" fill="none" stroke={colors.primary} strokeWidth="3" />
      <path d="M30 70 Q34 58 46 53 M74 53 Q86 58 90 70" fill="none" stroke={colors.primary} strokeWidth="3" />
      <text x="60" y="97" textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize="24" fill={colors.primary}>
        {number}
      </text>
    </svg>
  );
}

export function Ovr({ value, label }: { value: number; label?: string }) {
  return (
    <span className={`ovr ${ovrTone(value)}`} title={label ?? 'Overall rating'}>
      {value}
    </span>
  );
}

export function AttrBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="attr">
      <span className="attr-label">{label}</span>
      <span className="attr-track">
        <span className={`attr-fill ${attrTone(value)}`} style={{ width: `${(value / 20) * 100}%` }} />
      </span>
      <span className={`attr-value ${attrTone(value)}`}>{value}</span>
    </div>
  );
}

export function Stars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="stars" aria-label={`${value} of 5 stars`}>
      {'★'.repeat(full)}
      {half ? '½' : ''}
      <span className="stars-empty">{'★'.repeat(5 - full - (half ? 1 : 0))}</span>
    </span>
  );
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          <span className="seg-label">{o.label}</span>
          {o.hint && <span className="seg-hint">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
