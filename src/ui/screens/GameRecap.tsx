import { useEffect, useState } from 'react';
import type { GameResult } from '../../engine';
import type { SaveGame } from '../../storage/saves';
import { TeamBadge } from '../components';
import { href } from '../router';

const QUARTER_MS = 650;

/**
 * The game you just played: the score fills in quarter by quarter, then the
 * final with the top performers on both sides.
 */
export function GameRecap({ save, gameId, onClose }: { save: SaveGame; gameId: string; onClose: () => void }) {
  const box: GameResult | undefined = save.season.boxScores[gameId];
  const periods = box ? box.home.quarters.length : 0;
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(reduced ? periods : 0);
  useEffect(() => {
    if (shown >= periods) return;
    const t = setTimeout(() => setShown((n) => n + 1), QUARTER_MS);
    return () => clearTimeout(t);
  }, [shown, periods]);
  if (!box) return null;

  const me = save.career.teamId;
  const team = (id: string) => save.league.teams.find((t) => t.id === id);
  const sum = (q: number[]) => q.slice(0, shown).reduce((a, b) => a + b, 0);
  const final = shown >= periods;
  const mine = box.home.teamId === me ? box.home : box.away;
  const theirs = box.home.teamId === me ? box.away : box.home;
  const won = mine.score > theirs.score;
  const label = (i: number) => (i < 4 ? `Q${i + 1}` : `OT${i - 3 > 1 ? i - 3 : ''}`);
  const top = (side: GameResult['home']) =>
    [...side.lines]
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 3)
      .map((l) => ({ l, p: save.league.players.find((x) => x.id === l.playerId) }));

  return (
    <section className={`recap ${final ? (won ? 'won' : 'lost') : 'live'}`} aria-live="polite">
      <div className="recap-strap">
        <span className="strap">{final ? (won ? 'Final · Win' : 'Final · Loss') : `Live · ${label(Math.max(0, shown - 1))}`}</span>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {final ? 'Continue' : 'Skip'}
        </button>
      </div>
      <div className="recap-score">
        {[box.away, box.home].map((side, i) => {
          const t = team(side.teamId);
          return (
            <div key={side.teamId} className={`recap-team ${i ? 'home' : ''} ${final && side.score > (i ? box.away : box.home).score ? 'winner' : ''}`}>
              {t && <TeamBadge team={t} size={44} />}
              <span className="recap-name">{t?.name}</span>
              <span className="recap-pts">{final ? side.score : sum(side.quarters)}</span>
            </div>
          );
        })}
      </div>
      <table className="recap-quarters">
        <thead>
          <tr>
            <th />
            {box.home.quarters.map((_, i) => (
              <th key={i}>{label(i)}</th>
            ))}
            <th>T</th>
          </tr>
        </thead>
        <tbody>
          {[box.away, box.home].map((side) => (
            <tr key={side.teamId}>
              <th>{team(side.teamId)?.abbrev}</th>
              {side.quarters.map((q, i) => (
                <td key={i}>{i < shown ? q : ''}</td>
              ))}
              <td>
                <strong>{final ? side.score : sum(side.quarters)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {final && (
        <>
          <div className="recap-leaders">
            {[mine, theirs].map((side) => (
              <div key={side.teamId}>
                <span className="label">{team(side.teamId)?.name}</span>
                <ul>
                  {top(side).map(({ l, p }) => (
                    <li key={l.playerId}>
                      <a href={href('c', save.id, 'player', l.playerId)}>{p ? `${p.firstName.charAt(0)}. ${p.lastName}` : '—'}</a>
                      <span>
                        {l.pts} pts · {l.orb + l.drb} reb · {l.ast} ast
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <a className="btn" href={href('c', save.id, 'game', gameId)}>
            Full box score
          </a>
        </>
      )}
    </section>
  );
}
