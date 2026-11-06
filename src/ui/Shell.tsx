import type { ReactNode } from 'react';
import { teamName } from '../engine';
import { useCareer } from './career-context';
import { TeamBadge } from './components';
import { seasonLabel } from './format';
import { href } from './router';

type IconName = 'home' | 'roster' | 'league' | 'money' | 'staff' | 'settings' | 'more' | 'back';

const PATHS: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  roster: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.7 0-6 1.3-6 3.5V19h12v-2.5C14 14.3 10.7 13 8 13zm8 0c-.4 0-.8 0-1.2.1 1.3.9 2.2 2 2.2 3.4V19h5v-2.5c0-2.2-3.3-3.5-6-3.5z',
  league: 'M7 4h10v3a5 5 0 0 1-10 0zM5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M12 12v4m-4 4h8m-6-4h4',
  money: 'M12 2v20M17 6.5C17 4.6 14.8 4 12 4S7 4.9 7 7c0 4.5 10 2.5 10 7 0 2.2-2.2 3-5 3s-5-.8-5-2.8',
  staff: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  back: 'M15 18l-6-6 6-6',
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  mobile: boolean;
}

const NAV: NavItem[] = [
  { key: 'home', label: 'Home', icon: 'home', mobile: true },
  { key: 'roster', label: 'Roster', icon: 'roster', mobile: true },
  { key: 'league', label: 'League', icon: 'league', mobile: true },
  { key: 'finances', label: 'Finances', icon: 'money', mobile: true },
  { key: 'staff', label: 'Staff', icon: 'staff', mobile: false },
  { key: 'settings', label: 'Settings', icon: 'settings', mobile: false },
];

export function Shell({ section, children }: { section: string; children: ReactNode }) {
  const { save } = useCareer();
  const team = save.league.teams.find((t) => t.id === save.career.teamId);
  const unread = save.inbox.filter((m) => !m.read).length;
  const id = save.id;
  const moreActive = section === 'staff' || section === 'settings' || section === 'more';

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href={href()}>
          <img src="icons/favicon.svg" alt="" width={28} height={28} />
          <span>NBA Manager</span>
        </a>
        {team && (
          <div className="sidebar-team">
            <TeamBadge team={team} size={44} />
            <div>
              <div className="sidebar-team-name">{teamName(team)}</div>
              <div className="muted small">{seasonLabel(save.league.meta.season)} · Preseason</div>
            </div>
          </div>
        )}
        <nav>
          {NAV.map((n) => (
            <a key={n.key} href={href('c', id, n.key)} className={section === n.key ? 'active' : ''}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.key === 'home' && unread > 0 && <span className="badge-count">{unread}</span>}
            </a>
          ))}
        </nav>
        <a className="sidebar-exit" href={href()}>
          <Icon name="back" size={18} /> Main menu
        </a>
      </aside>

      <div className="main">
        {team && (
          <header className="topbar">
            <TeamBadge team={team} size={32} />
            <div className="topbar-text">
              <div className="topbar-team">{teamName(team)}</div>
              <div className="muted small">{seasonLabel(save.league.meta.season)} · Preseason</div>
            </div>
          </header>
        )}
        <main className="content">{children}</main>
      </div>

      <nav className="tabbar">
        {NAV.filter((n) => n.mobile).map((n) => (
          <a key={n.key} href={href('c', id, n.key)} className={section === n.key ? 'active' : ''}>
            <span className="tab-icon">
              <Icon name={n.icon} />
              {n.key === 'home' && unread > 0 && <span className="dot" />}
            </span>
            <span>{n.label}</span>
          </a>
        ))}
        <a href={href('c', id, 'more')} className={moreActive ? 'active' : ''}>
          <span className="tab-icon">
            <Icon name="more" />
          </span>
          <span>More</span>
        </a>
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      {back && (
        <a className="back-link" href={back}>
          <Icon name="back" size={18} /> Back
        </a>
      )}
      <div className="page-header-row">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </div>
  );
}
