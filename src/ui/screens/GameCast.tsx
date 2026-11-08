import { useEffect, useMemo, useState } from 'react';
import type { PlayEvent, Player } from '../../engine';
import type { SaveGame } from '../../storage/saves';
import { TeamBadge } from '../components';

export type WatchMode = 'full' | 'key' | 'crunch';

type Pt = { x: number; y: number };
interface Frame {
  pos: Record<string, Pt>;
  ball: Pt;
  holder: string | null;
  flight: boolean;
  caption: string;
  /** Index into the event list this frame belongs to. */
  ev: number;
  /** Score shown on the bug from this frame on. */
  score: [number, number];
  flash?: string;
}

const W = 940;
const H = 500;
const RIM_R: Pt = { x: 884, y: 250 };
const STEP_MS = 760;

/** Spots for the offense attacking the right basket; the left end mirrors them. */
const OFF_SPOTS: Pt[] = [
  { x: 640, y: 250 },
  { x: 700, y: 92 },
  { x: 872, y: 452 },
  { x: 770, y: 186 },
  { x: 812, y: 316 },
];
const SHOT_SPOT: Record<NonNullable<PlayEvent['kind']>, Pt[]> = {
  rim: [{ x: 858, y: 236 }, { x: 852, y: 266 }],
  mid: [{ x: 760, y: 170 }, { x: 742, y: 250 }, { x: 772, y: 330 }],
  three: [{ x: 640, y: 250 }, { x: 700, y: 82 }, { x: 870, y: 38 }, { x: 700, y: 418 }, { x: 870, y: 462 }],
};

/** Home attacks the right basket in the first half and overtime. */
const attacksRight = (side: 'home' | 'away', q: number) => (side === 'home') === (q <= 2 || q >= 5);
const flip = (p: Pt, right: boolean): Pt => (right ? p : { x: W - p.x, y: H - p.y });
const toward = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const clockText = (q: number, sec: number) => `${q <= 4 ? `Q${q}` : `OT${q > 5 ? q - 4 : ''}`} ${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** Which plays a mode shows. Key moments: big plays, plus every play of a close finish. */
export function pickEvents(log: PlayEvent[], mode: WatchMode, stars: Set<string>): number[] {
  const close = (e: PlayEvent) => Math.abs(e.score[0] - e.score[1]) <= 10;
  const late = (e: PlayEvent) => e.q >= 5 || (e.q === 4 && e.clock <= 300);
  return log
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => {
      if (mode === 'full') return true;
      if (mode === 'crunch') return late(e);
      if (late(e) && close(e)) return true;
      return (e.type === 'shot' && e.made && (e.kind === 'three' || stars.has(e.player) || e.andOne)) || !!e.block || !!e.steal;
    })
    .map((x) => x.i);
}

export function GameCast({ save, gameId, log, mode, onDone }: { save: SaveGame; gameId: string; log: PlayEvent[]; mode: WatchMode; onDone: () => void }) {
  const { league } = save;
  const game = [...save.season.games, ...save.season.series.flatMap((s) => s.games)].find((g) => g.id === gameId);
  const players = useMemo(() => new Map(league.players.map((p) => [p.id, p])), [league]);
  const team = (id?: string) => league.teams.find((t) => t.id === id);
  const home = team(game?.home);
  const away = team(game?.away);
  const name = (id?: string) => {
    const p = id ? players.get(id) : undefined;
    return p ? p.lastName : 'Someone';
  };

  const stars = useMemo(() => {
    const ovr = (p: Player) => Object.values(p.attributes).reduce((s, v) => s + v, 0);
    const top = (ids: string[]) => ids.map((id) => players.get(id)).filter((p): p is Player => !!p).sort((a, b) => ovr(b) - ovr(a)).slice(0, 2);
    const first = log[0];
    return new Set(first ? [...top(first.homeCourt), ...top(first.awayCourt)].map((p) => p.id) : []);
  }, [log, players]);
  const shown = useMemo(() => pickEvents(log, mode, stars), [log, mode, stars]);

  // Build the animation frames once.
  const frames = useMemo(() => {
    const out: Frame[] = [];
    let prevScore: [number, number] = [0, 0];
    for (const i of shown) {
      const e = log[i]!;
      const right = attacksRight(e.off, e.q);
      const offIds = e.off === 'home' ? e.homeCourt : e.awayCourt;
      const defIds = e.off === 'home' ? e.awayCourt : e.homeCourt;
      const rim = flip(RIM_R, right);
      const base: Record<string, Pt> = {};
      offIds.forEach((id, k) => (base[id] = flip(OFF_SPOTS[k]!, right)));
      defIds.forEach((id, k) => (base[id] = toward(base[offIds[k]!]!, rim, 0.3)));
      const handler = offIds[0]!;
      const caption0 = e.type === 'ft' ? '' : `${e.off === 'home' ? home?.name : away?.name} bring it up`;
      out.push({ pos: { ...base }, ball: base[handler]!, holder: handler, flight: false, caption: caption0, ev: i, score: prevScore });

      if (e.type === 'tov') {
        const loser = e.player;
        const lp = base[loser] ?? base[handler]!;
        out.push({ pos: { ...base }, ball: lp, holder: loser, flight: false, caption: `${name(loser)} with the ball…`, ev: i, score: prevScore });
        const thief = e.steal;
        const pos = { ...base };
        if (thief) pos[thief] = toward(lp, rim, -0.1);
        out.push({ pos, ball: thief ? pos[thief]! : toward(lp, { x: W / 2, y: H + 20 }, 0.4), holder: thief ?? null, flight: true, caption: thief ? `Stolen by ${name(thief)}!` : `Turnover by ${name(loser)}`, ev: i, score: e.score, flash: 'TURNOVER' });
      } else if (e.type === 'ft') {
        const line = flip({ x: 744, y: 250 }, right);
        const pos = { ...base, [e.player]: line };
        const n = e.fta ?? 2;
        out.push({ pos, ball: line, holder: e.player, flight: false, caption: `${name(e.player)} to the line for ${n}`, ev: i, score: prevScore });
        out.push({ pos, ball: rim, holder: null, flight: true, caption: `${name(e.player)} makes ${e.ftm ?? 0} of ${n}`, ev: i, score: e.score, flash: e.ftm ? `+${e.ftm}` : undefined });
      } else {
        const kind = e.kind ?? 'mid';
        const spots = SHOT_SPOT[kind];
        const spot = flip(spots[hash(e.player + i) % spots.length]!, right);
        const pos = { ...base, [e.player]: spot };
        // Nearest defender closes out.
        const closer = defIds[offIds.indexOf(e.player)] ?? defIds[0]!;
        pos[closer] = toward(spot, rim, kind === 'rim' ? 0.35 : 0.18);
        if (e.assist && e.assist !== e.player) {
          out.push({ pos: { ...base }, ball: base[e.assist] ?? base[handler]!, holder: e.assist, flight: true, caption: `${name(e.assist)} looks for ${name(e.player)}`, ev: i, score: prevScore });
        }
        const where = kind === 'rim' ? 'attacks the rim' : kind === 'three' ? 'from deep' : 'pulls up';
        out.push({ pos, ball: spot, holder: e.player, flight: !!e.assist, caption: `${name(e.player)} ${where}…`, ev: i, score: prevScore });
        const pts = kind === 'three' ? 3 : 2;
        const text = e.made
          ? `${kind === 'three' ? 'BANG! ' : ''}${name(e.player)} scores${e.assist && e.assist !== e.player ? ` (assist ${name(e.assist)})` : ''}${e.andOne ? ' and the foul!' : ''}`
          : e.type === 'shot' && e.fta
            ? `Fouled! ${name(e.player)} to the line`
            : e.block
              ? `Blocked by ${name(e.block)}!`
              : `${name(e.player)} misses`;
        out.push({ pos, ball: rim, holder: null, flight: true, caption: text, ev: i, score: e.made ? e.score : prevScore, flash: e.made ? `+${pts}` : e.block ? 'BLOCK' : undefined });
        if (!e.made && e.rebound) {
          const rp = { ...pos, [e.rebound]: toward(rim, { x: W / 2, y: H / 2 }, 0.1) };
          out.push({ pos: rp, ball: rp[e.rebound]!, holder: e.rebound, flight: false, caption: `${e.orb ? 'Offensive rebound' : 'Rebound'}: ${name(e.rebound)}`, ev: i, score: e.score });
        } else if (!e.made && e.fta) {
          out.push({ pos, ball: rim, holder: null, flight: true, caption: `${name(e.player)} makes ${e.ftm ?? 0} of ${e.fta} at the line`, ev: i, score: e.score, flash: e.ftm ? `+${e.ftm}` : undefined });
        }
      }
      prevScore = e.score;
    }
    return out;
  }, [shown, log]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phones zoom to the half of the court where the play is.
  const [narrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches);
  const [at, setAt] = useState(0);
  const [speed, setSpeed] = useState(2);
  const [paused, setPaused] = useState(false);
  const done = at >= frames.length - 1;
  useEffect(() => {
    if (paused || done) return;
    const t = setTimeout(() => setAt((n) => n + 1), STEP_MS / speed);
    return () => clearTimeout(t);
  }, [at, paused, speed, done]);

  const f = frames[Math.min(at, frames.length - 1)];
  const e = f ? log[f.ev] : undefined;
  if (!f || !e || !home || !away) {
    return (
      <div className="cast">
        <button className="btn btn-primary" type="button" onClick={onDone}>
          See the result
        </button>
      </div>
    );
  }
  const onCourt = [...e.homeCourt.map((id) => ({ id, side: 'home' as const })), ...e.awayCourt.map((id) => ({ id, side: 'away' as const }))];
  const colors = { home: home.colors.primary, away: away.colors.primary };
  // Feed: the last plays shown so far, newest first.
  const seen = shown.filter((i) => i <= f.ev);
  const feed = seen.slice(-7).reverse().map((i) => {
    const x = log[i]!;
    const who = name(x.player);
    const text = x.type === 'tov' ? `${who} turnover${x.steal ? ` (steal ${name(x.steal)})` : ''}` : x.type === 'ft' ? `${who} ${x.ftm}/${x.fta} FT` : x.made ? `${who} ${x.kind === 'three' ? 'three' : x.kind === 'rim' ? 'layup/dunk' : 'jumper'}${x.andOne ? ' + and-one' : ''}` : `${who} misses ${x.kind === 'three' ? 'a three' : 'a shot'}${x.block ? ` (blocked by ${name(x.block)})` : ''}`;
    return { i, text, side: x.off, clock: clockText(x.q, x.clock), scored: (x.type === 'shot' && x.made) || (x.ftm ?? 0) > 0 };
  });
  const pts = new Map<string, number>();
  for (const i of seen) {
    const x = log[i]!;
    const p = (x.type === 'shot' && x.made ? (x.kind === 'three' ? 3 : 2) : 0) + (x.ftm ?? 0);
    if (p) pts.set(x.player, (pts.get(x.player) ?? 0) + p);
  }
  const leaders = [...pts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="cast" role="dialog" aria-label={`${away.name} at ${home.name}, live`}>
      <div className="cast-top">
        <span className="cast-live">● LIVE</span>
        <span className="cast-mode">{mode === 'full' ? 'Full game' : mode === 'key' ? 'Key moments' : 'Crunch time'}</span>
        <span style={{ flex: 1 }} />
        <div className="cast-speed" role="group" aria-label="Speed">
          {[1, 2, 4].map((s) => (
            <button key={s} type="button" className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        <button type="button" className="cast-btn" onClick={() => setPaused((p) => !p)}>
          {paused ? '▶ Play' : '❚❚ Pause'}
        </button>
        <button type="button" className="cast-btn red" onClick={onDone}>
          {done ? 'Final ▸' : 'Skip ▸'}
        </button>
      </div>

      <div className="cast-bug">
        <div className="cast-team" style={{ background: colors.away }}>
          <TeamBadge team={away} size={30} />
          <span className="cast-name">{away.name}</span>
          <span className="cast-score">{f.score[1]}</span>
        </div>
        <div className="cast-clock">
          <strong>{clockText(e.q, e.clock)}</strong>
        </div>
        <div className="cast-team home" style={{ background: colors.home }}>
          <span className="cast-score">{f.score[0]}</span>
          <span className="cast-name">{home.name}</span>
          <TeamBadge team={home} size={30} />
        </div>
      </div>

      <div className="cast-main">
        <div className="cast-court-wrap">
          <svg className="cast-court" viewBox={narrow ? `${attacksRight(e.off, e.q) ? W / 2 - 20 : 0} 0 ${W / 2 + 20} ${H}` : `0 0 ${W} ${H}`} role="img" aria-label="Court">
            <defs>
              <clipPath id="cast-round" clipPathUnits="objectBoundingBox">
                <circle cx=".5" cy=".5" r=".5" />
              </clipPath>
            </defs>
            <rect width={W} height={H} fill="#efdcb6" />
            <g fill="none" stroke="#3b3b3b" strokeWidth="2.5" opacity=".7">
              <rect x="4" y="4" width="932" height="492" />
              <line x1="470" y1="4" x2="470" y2="496" />
              <circle cx="470" cy="250" r="60" />
              <rect x="4" y="170" width="190" height="160" fill={colors.away} fillOpacity=".12" />
              <rect x="746" y="170" width="190" height="160" fill={colors.home} fillOpacity=".12" />
              <circle cx="194" cy="250" r="60" />
              <circle cx="746" cy="250" r="60" />
              <path d="M4 30 H144 A238 238 0 0 1 144 470 H4" />
              <path d="M936 30 H796 A238 238 0 0 0 796 470 H936" />
            </g>
            <g stroke="#d50a0a" strokeWidth="3" fill="none">
              <line x1="40" y1="220" x2="40" y2="280" />
              <line x1="900" y1="220" x2="900" y2="280" />
              <circle cx="56" cy="250" r="9" />
              <circle cx="884" cy="250" r="9" />
            </g>
            {onCourt.map(({ id, side }) => {
              const p = players.get(id);
              const at2 = f.pos[id] ?? { x: W / 2, y: H / 2 };
              const r = narrow ? 30 : 22;
              const color = colors[side];
              const has = f.holder === id;
              return (
                <g key={id} className="cast-token" style={{ transform: `translate(${at2.x}px, ${at2.y}px)`, transitionDuration: `${(STEP_MS * 0.85) / speed}ms` }}>
                  {has && <circle r={r + 7} fill="none" stroke="#f07a1a" strokeWidth="4" />}
                  <circle r={r} fill="#dfe3e8" />
                  {p?.photo ? (
                    <image href={p.photo.url} x={-r} y={-r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMin slice" clipPath="url(#cast-round)" />
                  ) : null}
                  <circle r={r - 1.5} fill="none" stroke={color} strokeWidth="4" />
                  <circle cx={r - 4} cy={r - 4} r="10" fill={color} stroke="#fff" strokeWidth="2" />
                  <text x={r - 4} y={r} textAnchor="middle" className="cast-num">
                    {p?.jersey ?? ''}
                  </text>
                </g>
              );
            })}
            <g className={`cast-ball ${f.flight ? 'flight' : ''}`} style={{ transform: `translate(${f.ball.x + (f.holder ? 14 : 0)}px, ${f.ball.y - (f.holder ? 14 : 0)}px)`, transitionDuration: `${(STEP_MS * 0.7) / speed}ms` }}>
              <circle r="8" fill="#f07a1a" stroke="#7a3a08" strokeWidth="2" />
            </g>
            {f.flash && (
              <g key={at} className="cast-flash">
                <text x={W / 2} y={H / 2 + 18} textAnchor="middle">
                  {f.flash}
                </text>
              </g>
            )}
          </svg>
          <div className="cast-caption">{f.caption}</div>
        </div>
        <aside className="cast-side">
          <h3>Play-by-play</h3>
          <ol className="cast-feed">
            {feed.map((x) => (
              <li key={x.i} className={x.scored ? 'scored' : ''}>
                <i style={{ background: colors[x.side] }} />
                <span className="muted small">{x.clock}</span> {x.text}
              </li>
            ))}
          </ol>
          <h3>Leading scorers</h3>
          <ul className="cast-leaders">
            {leaders.map(([id, n]) => (
              <li key={id}>
                <span>{players.get(id) ? `${players.get(id)!.firstName.charAt(0)}. ${players.get(id)!.lastName}` : id}</span>
                <strong>{n}</strong>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <div className="cast-progress" aria-hidden="true">
        <span style={{ width: `${(at / Math.max(1, frames.length - 1)) * 100}%` }} />
      </div>
    </div>
  );
}

/** Before tip-off: how to follow the game. */
export function WatchChooser({ save, onPick, onCancel }: { save: SaveGame; onPick: (mode: WatchMode | 'instant', remember: boolean) => void; onCancel: () => void }) {
  const [remember, setRemember] = useState(false);
  const me = save.career.teamId;
  const g = save.season.games.filter((x) => x.hs === undefined && (x.home === me || x.away === me)).sort((a, b) => a.day - b.day)[0];
  const t = (id?: string) => save.league.teams.find((x) => x.id === id);
  const options: { mode: WatchMode | 'instant'; title: string; time: string; text: string }[] = [
    { mode: 'full', title: 'Full game in 2D', time: '~6 min at 2×', text: 'Every possession on the court: passes, drives, shots and rebounds.' },
    { mode: 'key', title: 'Key moments', time: '~2 min', text: 'Threes, big plays, blocks and steals, then all of a close finish.' },
    { mode: 'crunch', title: 'Crunch time', time: 'Last 5 min', text: 'Jump to the last five minutes and watch the finish.' },
    { mode: 'instant', title: 'Instant result', time: '1 sec', text: 'Straight to the final score and box score.' },
  ];
  return (
    <div className="chooser-backdrop" role="dialog" aria-label="How do you want to follow this game?">
      <div className="chooser">
        <div className="chooser-head">
          <span className="strap">Tip-off</span>
          <strong>
            {g ? `${t(g.away)?.name} @ ${t(g.home)?.name}` : 'Next game'}
          </strong>
          <span className="muted small">How do you want to follow this one?</span>
        </div>
        <div className="chooser-grid">
          {options.map((o) => (
            <button key={o.mode} type="button" className={`chooser-opt ${o.mode === 'full' ? 'main' : ''}`} onClick={() => onPick(o.mode, remember)}>
              <span className="chooser-title">
                <b>{o.title}</b>
                <span>{o.time}</span>
              </span>
              <span className="small">{o.text}</span>
            </button>
          ))}
        </div>
        <div className="chooser-foot">
          <label>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember my choice (change it in Settings)
          </label>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
