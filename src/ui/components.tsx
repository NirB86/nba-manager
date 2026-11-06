import type { ReactNode } from 'react';
import type { Team } from '../engine';
import { attrTone, ovrTone } from './format';

export function TeamBadge({ team, size = 40 }: { team: Pick<Team, 'abbrev' | 'colors'>; size?: number }) {
  return (
    <span
      className="team-badge"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        background: team.colors.primary,
        boxShadow: `inset 0 0 0 ${Math.max(2, size / 14)}px ${team.colors.secondary}`,
      }}
      aria-hidden="true"
    >
      {team.abbrev}
    </span>
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
