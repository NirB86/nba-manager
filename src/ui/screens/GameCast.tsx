import { useEffect, useMemo, useRef, useState } from 'react';
import { LiveGame, Rng, newSeed, type GameResult, type LiveState, type PlayEvent, type Player, type Tactics } from '../../engine';
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
export function isShown(e: PlayEvent, mode: WatchMode, stars: Set<string>): boolean {
  const close = Math.abs(e.score[0] - e.score[1]) <= 10;
  const late = e.q >= 5 || (e.q === 4 && e.clock <= 300);
  if (mode === 'full') return true;
  if (mode === 'crunch') return late;
  if (late && close) return true;
  return (e.type === 'shot' && !!e.made && (e.kind === 'three' || stars.has(e.player) || !!e.andOne)) || !!e.block || !!e.steal;
}

/** Animation steps for one possession. */
function framesFor(e: PlayEvent, evIndex: number, prevScore: [number, number], name: (id?: string) => string, teamName: (side: 'home' | 'away') => string): Frame[] {
  const out: Frame[] = [];
  const right = attacksRight(e.off, e.q);
  const offIds = e.off === 'home' ? e.homeCourt : e.awayCourt;
  const defIds = e.off === 'home' ? e.awayCourt : e.homeCourt;
  const rim = flip(RIM_R, right);
  const base: Record<string, Pt> = {};
  offIds.forEach((id, k) => (base[id] = flip(OFF_SPOTS[k]!, right)));
  defIds.forEach((id, k) => (base[id] = toward(base[offIds[k]!]!, rim, 0.3)));
  const handler = offIds[0]!;
  out.push({ pos: { ...base }, ball: base[handler]!, holder: handler, flight: false, caption: e.type === 'ft' ? '' : `${teamName(e.off)} bring it up`, ev: evIndex, score: prevScore });

  if (e.type === 'tov') {
    const lp = base[e.player] ?? base[handler]!;
    out.push({ pos: { ...base }, ball: lp, holder: e.player, flight: false, caption: `${name(e.player)} with the ball…`, ev: evIndex, score: prevScore });
    const pos = { ...base };
    if (e.steal) pos[e.steal] = toward(lp, rim, -0.1);
    out.push({ pos, ball: e.steal ? pos[e.steal]! : toward(lp, { x: W / 2, y: H + 20 }, 0.4), holder: e.steal ?? null, flight: true, caption: e.steal ? `Stolen by ${name(e.steal)}!` : `Turnover by ${name(e.player)}`, ev: evIndex, score: e.score, flash: 'TURNOVER' });
  } else if (e.type === 'ft') {
    const line = flip({ x: 744, y: 250 }, right);
    const pos = { ...base, [e.player]: line };
    const n = e.fta ?? 2;
    out.push({ pos, ball: line, holder: e.player, flight: false, caption: `${name(e.player)} to the line for ${n}`, ev: evIndex, score: prevScore });
    out.push({ pos, ball: rim, holder: null, flight: true, caption: `${name(e.player)} makes ${e.ftm ?? 0} of ${n}`, ev: evIndex, score: e.score, flash: e.ftm ? `+${e.ftm}` : undefined });
  } else {
    const kind = e.kind ?? 'mid';
    const spots = SHOT_SPOT[kind];
    const spot = flip(spots[hash(e.player + evIndex) % spots.length]!, right);
    const pos = { ...base, [e.player]: spot };
    const closer = defIds[offIds.indexOf(e.player)] ?? defIds[0]!;
    pos[closer] = toward(spot, rim, kind === 'rim' ? 0.35 : 0.18);
    if (e.assist && e.assist !== e.player) {
      out.push({ pos: { ...base }, ball: base[e.assist] ?? base[handler]!, holder: e.assist, flight: true, caption: `${name(e.assist)} looks for ${name(e.player)}`, ev: evIndex, score: prevScore });
    }
    const where = kind === 'rim' ? 'attacks the rim' : kind === 'three' ? 'from deep' : 'pulls up';
    out.push({ pos, ball: spot, holder: e.player, flight: !!e.assist, caption: `${name(e.player)} ${where}…`, ev: evIndex, score: prevScore });
    const pts = kind === 'three' ? 3 : 2;
    const text = e.made
      ? `${kind === 'three' ? 'BANG! ' : ''}${name(e.player)} scores${e.assist && e.assist !== e.player ? ` (assist ${name(e.assist)})` : ''}${e.andOne ? ' and the foul!' : ''}`
      : e.fta
        ? `Fouled! ${name(e.player)} to the line`
        : e.block
          ? `Blocked by ${name(e.block)}!`
          : `${name(e.player)} misses`;
    out.push({ pos, ball: rim, holder: null, flight: true, caption: text, ev: evIndex, score: e.made ? e.score : prevScore, flash: e.made ? `+${pts}` : e.block ? 'BLOCK' : undefined });
    if (!e.made && e.rebound) {
      const rp = { ...pos, [e.rebound]: toward(rim, { x: W / 2, y: H / 2 }, 0.1) };
      out.push({ pos: rp, ball: rp[e.rebound]!, holder: e.rebound, flight: false, caption: `${e.orb ? 'Offensive rebound' : 'Rebound'}: ${name(e.rebound)}`, ev: evIndex, score: e.score });
    } else if (!e.made && e.fta) {
      out.push({ pos, ball: rim, holder: null, flight: true, caption: `${name(e.player)} makes ${e.ftm ?? 0} of ${e.fta} at the line`, ev: evIndex, score: e.score, flash: e.ftm ? `+${e.ftm}` : undefined });
    }
  }
  return out;
}

interface Alert {
  key: string;
  text: string;
  playerId: string;
}

/**
 * Your game, live: played one possession at a time while you watch and coach.
 * Timeouts, substitutions and tactics change what happens next.
 */
export function GameCast({ save, homeId, awayId, mode, onFinish }: { save: SaveGame; homeId: string; awayId: string; mode: WatchMode; onFinish: (result: GameResult) => void }) {
  const { league } = save;
  const me = save.career.teamId;
  const mine: 'home' | 'away' = homeId === me ? 'home' : 'away';
  const players = useMemo(() => new Map(league.players.map((p) => [p.id, p])), [league]);
  const team = (id?: string) => league.teams.find((t) => t.id === id);
  const home = team(homeId);
  const away = team(awayId);
  const name = (id?: string) => (id ? (players.get(id)?.lastName ?? 'Someone') : 'Someone');
  const teamName = (side: 'home' | 'away') => (side === 'home' ? home?.name : away?.name) ?? '';

  // The game itself: the same rosters the season uses.
  const game = useRef<LiveGame | null>(null);
  if (!game.current) {
    const roster = (id: string) => league.players.filter((p) => p.teamId === id);
    game.current = new LiveGame(new Rng(newSeed()), { teamId: homeId, players: roster(homeId) }, { teamId: awayId, players: roster(awayId) });
  }
  const live = game.current;
  const stars = useMemo(() => {
    const rank = (ids: string[]) => ids.map((id) => players.get(id)).filter((p): p is Player => !!p).sort((a, b) => Object.values(b.attributes).reduce((s, v) => s + v, 0) - Object.values(a.attributes).reduce((s, v) => s + v, 0));
    const s = live.state();
    return new Set([...rank(s.home.players.filter((p) => p.onCourt).map((p) => p.id)).slice(0, 2), ...rank(s.away.players.filter((p) => p.onCourt).map((p) => p.id)).slice(0, 2)].map((p) => p.id));
  }, [live, players]);

  const [narrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches);
  const [events, setEvents] = useState<PlayEvent[]>([]);
  const [frame, setFrame] = useState<Frame | null>(null);
  const queue = useRef<Frame[]>([]);
  const [state, setState] = useState<LiveState>(() => live.state());
  const [speed, setSpeed] = useState(2);
  const [paused, setPaused] = useState(false);
  const [panel, setPanel] = useState<'lineup' | 'tactics' | null>(narrow ? null : 'lineup');
  const [picked, setPicked] = useState<string | null>(null);
  const [alert, setAlert] = useState<Alert | null>(null);
  const seenAlerts = useRef(new Set<string>());
  const [note, setNote] = useState<string | null>(null);
  // Coaching confirmations show briefly, then the play-by-play takes over again.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2200);
    return () => clearTimeout(t);
  }, [note]);
  const finished = state.done && queue.current.length === 0 && (!frame || frame === queue.current.at(-1) || true);

  /** Check for foul trouble and tired players on your side. */
  const checkAlerts = (st: LiveState) => {
    const side = st[mine];
    for (const p of side.players.filter((x) => x.onCourt)) {
      const trouble = p.fouls >= 5 || (p.fouls >= 4 && st.q <= 3) || (p.fouls >= 3 && st.q <= 2 && st.clock > 180);
      const tired = p.energy < 0.42;
      const key = trouble ? `foul-${p.id}-${p.fouls}` : tired ? `tired-${p.id}-${st.q}` : '';
      if (key && !seenAlerts.current.has(key)) {
        seenAlerts.current.add(key);
        return { key, playerId: p.id, text: trouble ? `${name(p.id)} has ${p.fouls} fouls.` : `${name(p.id)} is running out of gas (${Math.round(p.energy * 100)}% energy).` };
      }
    }
    return null;
  };

  // The loop: play possessions (instantly when the mode skips them), animate the ones shown.
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => {
      if (queue.current.length) {
        setFrame(queue.current.shift()!);
        return;
      }
      if (live.done) {
        setState(live.state());
        return;
      }
      const added: PlayEvent[] = [];
      let toShow: PlayEvent | null = null;
      for (let n = 0; n < 400 && !live.done; n++) {
        const e = live.step();
        if (!e) continue;
        added.push(e);
        if (isShown(e, mode, stars)) {
          toShow = e;
          break;
        }
      }
      const st = live.state();
      setState(st);
      setEvents((list) => {
        const all = [...list, ...added];
        if (toShow) {
          const prev = all.length > 1 ? all[all.length - 2]!.score : ([0, 0] as [number, number]);
          queue.current = framesFor(toShow, all.length - 1, prev, name, teamName);
          setFrame(queue.current.shift()!);
        }
        return all;
      });
      const a = checkAlerts(st);
      if (a) {
        setAlert(a);
        if (mode !== 'crunch') setPaused(true);
      }
    }, queue.current.length || !frame ? STEP_MS / speed : 60);
    return () => clearTimeout(t);
  }, [frame, paused, speed, events.length, state.done]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = (text?: string) => {
    setState(live.state());
    if (text) setNote(text);
  };
  const callTimeout = () => {
    if (live.timeout(mine)) {
      refresh(`Timeout ${teamName(mine)}: the players catch their breath.`);
      setPaused(true);
      setPanel('lineup');
    }
  };
  const setTactic = (t: Partial<Tactics>) => {
    live.setTactics(mine, t);
    refresh('New instructions from the bench.');
  };
  const toggleAuto = () => {
    live.setAutoSubs(mine, !state[mine].autoSubs);
    refresh(state[mine].autoSubs ? 'Rotation: you make the subs now.' : 'Rotation: your assistant makes the subs.');
  };
  const tapPlayer = (id: string, onCourt: boolean) => {
    if (!picked) return setPicked(id);
    const first = state[mine].players.find((p) => p.id === picked);
    if (!first || first.onCourt === onCourt) return setPicked(id);
    const out = onCourt ? id : picked;
    const inn = onCourt ? picked : id;
    if (live.substitute(mine, out, inn)) {
      if (state[mine].autoSubs) live.setAutoSubs(mine, false);
      refresh(`${name(inn)} in for ${name(out)}. You make the subs now.`);
    }
    setPicked(null);
  };
  const quickSub = (outId: string) => {
    const bench = state[mine].players.filter((p) => !p.onCourt && p.fouls < 6).sort((a, b) => b.energy - a.energy);
    const out = players.get(outId);
    const inn = bench.find((b) => players.get(b.id)?.position === out?.position) ?? bench[0];
    if (inn && live.substitute(mine, outId, inn.id)) refresh(`${name(inn.id)} in for ${name(outId)}.`);
    setAlert(null);
    setPaused(false);
  };
  const finish = () => {
    if (!live.done) live.runToEnd();
    onFinish(live.result());
  };

  if (!home || !away) return null;
  const f = frame;
  const e = f ? events[f.ev] : undefined;
  const right = e ? attacksRight(e.off, e.q) : true;
  const onCourt = [...state.home.players.filter((p) => p.onCourt).map((p) => ({ id: p.id, side: 'home' as const })), ...state.away.players.filter((p) => p.onCourt).map((p) => ({ id: p.id, side: 'away' as const }))];
  const shownIds = e ? new Set([...e.homeCourt, ...e.awayCourt]) : new Set(onCourt.map((x) => x.id));
  const tokens = e ? [...e.homeCourt.map((id) => ({ id, side: 'home' as const })), ...e.awayCourt.map((id) => ({ id, side: 'away' as const }))] : onCourt;
  const colors = { home: home.colors.primary, away: away.colors.primary };
  const score = state.done && queue.current.length === 0 ? state.score : (f?.score ?? [0, 0]);
  const shownEvents = events.filter((x) => isShown(x, mode, stars) || x.type === 'shot' || x.type === 'ft');
  const feed = shownEvents.slice(-7).reverse().map((x) => {
    const who = name(x.player);
    const text = x.type === 'tov' ? `${who} turnover${x.steal ? ` (steal ${name(x.steal)})` : ''}` : x.type === 'ft' ? `${who} ${x.ftm}/${x.fta} FT` : x.made ? `${who} ${x.kind === 'three' ? 'three' : x.kind === 'rim' ? 'layup/dunk' : 'jumper'}${x.andOne ? ' + and-one' : ''}` : `${who} misses ${x.kind === 'three' ? 'a three' : 'a shot'}${x.block ? ` (blocked by ${name(x.block)})` : ''}`;
    return { key: `${x.q}-${x.clock}-${x.player}-${x.type}`, text, side: x.off, clock: clockText(x.q, x.clock), scored: (x.type === 'shot' && !!x.made) || (x.ftm ?? 0) > 0 };
  });
  const my = state[mine];
  const lineup = [...my.players].sort((a, b) => Number(b.onCourt) - Number(a.onCourt) || b.sec - a.sec);
  const atEnd = state.done && queue.current.length === 0;
  void finished;
  void shownIds;

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
        <button type="button" className="cast-btn" onClick={() => setPaused((p) => !p)} disabled={atEnd}>
          {paused ? '▶ Play' : '❚❚ Pause'}
        </button>
        <button type="button" className="cast-btn red" onClick={finish}>
          {atEnd ? 'Final ▸' : 'Sim to end ▸'}
        </button>
      </div>

      <div className="cast-bug">
        <div className="cast-team" style={{ background: colors.away }}>
          <TeamBadge team={away} size={30} />
          <span className="cast-name">{away.name}</span>
          <span className="cast-score">{score[1]}</span>
        </div>
        <div className="cast-clock">
          <strong>{atEnd ? 'FINAL' : clockText(state.q, e ? e.clock : state.clock)}</strong>
        </div>
        <div className="cast-team home" style={{ background: colors.home }}>
          <span className="cast-score">{score[0]}</span>
          <span className="cast-name">{home.name}</span>
          <TeamBadge team={home} size={30} />
        </div>
      </div>

      {alert && (
        <div className="cast-alert" role="alert">
          <span className="strap">Assistant</span>
          <span>{alert.text}</span>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => quickSub(alert.playerId)}>
            Sub him out
          </button>
          <button type="button" className="btn btn-sm" onClick={() => { setAlert(null); setPaused(false); }}>
            Leave him in
          </button>
        </div>
      )}

      <div className="cast-main">
        <div className="cast-court-wrap">
          <svg className="cast-court" viewBox={narrow ? `${right ? W / 2 - 20 : 0} 0 ${W / 2 + 20} ${H}` : `0 0 ${W} ${H}`} role="img" aria-label="Court">
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
            {tokens.map(({ id, side }, k) => {
              const p = players.get(id);
              const spot = f?.pos[id] ?? { x: side === 'home' ? 600 + (k % 5) * 50 : 340 - (k % 5) * 50, y: 120 + (k % 5) * 60 };
              const r = narrow ? 30 : 22;
              const color = colors[side];
              return (
                <g key={id} className="cast-token" style={{ transform: `translate(${spot.x}px, ${spot.y}px)`, transitionDuration: `${(STEP_MS * 0.85) / speed}ms` }}>
                  {f?.holder === id && <circle r={r + 7} fill="none" stroke="#f07a1a" strokeWidth="4" />}
                  <circle r={r} fill="#dfe3e8" />
                  {p?.photo ? <image href={p.photo.url} x={-r} y={-r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMin slice" clipPath="url(#cast-round)" /> : null}
                  <circle r={r - 1.5} fill="none" stroke={color} strokeWidth="4" />
                  <circle cx={r - 4} cy={r - 4} r="10" fill={color} stroke="#fff" strokeWidth="2" />
                  <text x={r - 4} y={r} textAnchor="middle" className="cast-num">
                    {p?.jersey ?? ''}
                  </text>
                </g>
              );
            })}
            {f && (
              <g className={`cast-ball ${f.flight ? 'flight' : ''}`} style={{ transform: `translate(${f.ball.x + (f.holder ? 14 : 0)}px, ${f.ball.y - (f.holder ? 14 : 0)}px)`, transitionDuration: `${(STEP_MS * 0.7) / speed}ms` }}>
                <circle r="8" fill="#f07a1a" stroke="#7a3a08" strokeWidth="2" />
              </g>
            )}
            {f?.flash && (
              <g key={`${f.ev}-${f.flash}`} className="cast-flash">
                <text x={right ? 700 : 240} y={H / 2 + 18} textAnchor="middle">
                  {f.flash}
                </text>
              </g>
            )}
          </svg>
          <div className="cast-caption">{atEnd ? `Final: ${away.name} ${state.score[1]}, ${home.name} ${state.score[0]}` : (note ?? f?.caption ?? 'Tip-off')}</div>
        </div>

        <aside className="cast-side">
          <div className="cast-coach">
            <button type="button" className="btn btn-timeout" onClick={callTimeout} disabled={my.timeouts <= 0 || atEnd}>
              Timeout ({my.timeouts})
            </button>
            <button type="button" className={`btn ${panel === 'lineup' ? 'on' : ''}`} onClick={() => setPanel(panel === 'lineup' ? null : 'lineup')}>
              Lineup
            </button>
            <button type="button" className={`btn ${panel === 'tactics' ? 'on' : ''}`} onClick={() => setPanel(panel === 'tactics' ? null : 'tactics')}>
              Tactics
            </button>
          </div>

          {panel === 'tactics' && (
            <div className="cast-tactics">
              {(
                [
                  ['pace', 'Pace', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Push']]],
                  ['defense', 'Defense', [['man', 'Man'], ['switch', 'Switch all'], ['zone', '2-3 zone']]],
                  ['focus', 'Offense', [['balanced', 'Balanced'], ['inside', 'Attack inside'], ['three', 'Shoot threes'], ['star', 'Feed the star']]],
                ] as const
              ).map(([key, label, opts]) => (
                <div key={key} className="cast-tactic">
                  <span className="label">{label}</span>
                  <div className="cast-seg" role="group" aria-label={label}>
                    {opts.map(([v, l]) => (
                      <button key={v} type="button" className={my.tactics[key] === v ? 'on' : ''} onClick={() => setTactic({ [key]: v } as Partial<Tactics>)}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <p className="muted small">A zone protects the paint but gives up threes; switching stops jumpers but leaves mismatches inside. Pushing the pace means more possessions and more turnovers.</p>
            </div>
          )}

          {panel === 'lineup' && (
            <div className="cast-lineup">
              <label className="cast-auto">
                <input type="checkbox" checked={my.autoSubs} onChange={toggleAuto} /> Assistant makes the subs
              </label>
              <p className="muted small">{picked ? `Now tap who ${my.players.find((p) => p.id === picked)?.onCourt ? 'comes in' : 'goes out'}.` : 'Tap a player on the floor, then one on the bench, to swap them.'}</p>
              <ul>
                {lineup.map((p) => {
                  const pl = players.get(p.id);
                  return (
                    <li key={p.id}>
                      <button type="button" className={`cast-player ${p.onCourt ? 'court' : ''} ${picked === p.id ? 'picked' : ''}`} onClick={() => tapPlayer(p.id, p.onCourt)} disabled={p.fouls >= 6}>
                        <span className="cast-pname">
                          {p.onCourt && <i className="dot-on" />}
                          {pl ? `${pl.firstName.charAt(0)}. ${pl.lastName}` : p.id}
                          <small>{pl?.position}</small>
                        </span>
                        <span className="cast-energy" title={`Energy ${Math.round(p.energy * 100)}%`}>
                          <i style={{ width: `${Math.round(p.energy * 100)}%`, background: p.energy > 0.7 ? '#0a8f4e' : p.energy > 0.5 ? '#d97706' : '#d50a0a' }} />
                        </span>
                        <span className={`cast-fouls ${p.fouls >= 5 ? 'bad' : p.fouls >= 4 ? 'warn' : ''}`}>{p.fouls} PF</span>
                        <strong>{p.pts}</strong>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <h3>Play-by-play</h3>
          <ol className="cast-feed">
            {feed.map((x) => (
              <li key={x.key} className={x.scored ? 'scored' : ''}>
                <i style={{ background: colors[x.side] }} />
                <span className="muted small">{x.clock}</span> {x.text}
              </li>
            ))}
          </ol>
        </aside>
      </div>
      {atEnd && (
        <button type="button" className="btn btn-primary btn-lg cast-final" onClick={finish}>
          See the final result
        </button>
      )}
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
