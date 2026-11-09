// Press conferences: after streaks, trades, trade requests and the start of
// the playoffs, the media wants an answer. What you say moves the locker
// room's morale, one player's mood or the owner's confidence.

import { fullName, standings, type Rng } from '../engine';
import type { SaveGame } from '../storage/saves';
import { addMod } from './demands';
import { finance } from './finance';

export interface PressAnswer {
  label: string;
  /** Morale effect on the whole team. */
  team?: number;
  /** Morale effect on the player the question is about. */
  player?: number;
  /** Owner confidence change. */
  owner?: number;
  /** What the papers say afterwards. */
  headline: string;
}

export interface PressConference {
  id: string;
  topic: 'losing' | 'winning' | 'request' | 'trade' | 'playoffs' | 'youth';
  question: string;
  playerId?: string;
  answers: PressAnswer[];
  /** Game day it is no longer news. */
  expires: number;
  season: number;
}

function streakOf(save: SaveGame): { kind: 'W' | 'L'; n: number } | null {
  const row = standings(save.league, save.season.games).find((r) => r.teamId === save.career.teamId);
  const m = row?.streak.match(/^([WL])(\d+)$/);
  return m ? { kind: m[1] as 'W' | 'L', n: Number(m[2]) } : null;
}

/** Called once a week: maybe a press conference, if one is not already waiting. */
export function maybePress(save: SaveGame, rng: Rng) {
  const year = save.league.meta.season;
  const day = save.season.day;
  if (save.press && save.press.season === year && save.press.expires >= day) return;
  save.press = null;
  const make = (p: Omit<PressConference, 'id' | 'expires' | 'season'>): PressConference => ({
    ...p,
    id: `${p.topic}-${year}-${day}`,
    expires: day + 7,
    season: year,
  });
  const st = streakOf(save);
  const requests = Object.entries(save.demands?.requests ?? {}).filter(([, r]) => r.leaked);
  const lastTrade = (save.season.trades ?? []).filter((t) => t.teams.includes(save.career.teamId) && day - t.day <= 7).at(-1);

  if (requests.length) {
    const [id] = requests[0]!;
    const p = save.league.players.find((x) => x.id === id);
    if (p) {
      save.press = make({
        topic: 'request',
        playerId: id,
        question: `${fullName(p)} wants out. Will you trade him?`,
        answers: [
          {
            label: '"He is part of our future. We are not trading him."',
            player: 1.5,
            team: 0.5,
            owner: -1,
            headline: `GM stands by ${p.lastName}`,
          },
          {
            label: '"We will listen to offers, like for anyone."',
            player: -1,
            owner: 1,
            headline: `${p.lastName} on the block?`,
          },
          {
            label: '"No one is bigger than this team."',
            player: -2.5,
            team: 1,
            headline: `GM fires back at ${p.lastName}`,
          },
        ],
      });
      return;
    }
  }
  if (lastTrade) {
    save.press = make({
      topic: 'trade',
      question: `Why did you make the trade for ${lastTrade.got.join(', ')}?`,
      answers: [
        {
          label: '"It makes us better right now. We want to win this year."',
          team: 1,
          owner: 1,
          headline: 'GM: "We are going for it"',
        },
        {
          label: '"It is about the long term. Trust the plan."',
          team: -0.5,
          owner: 0.5,
          headline: 'GM preaches patience after trade',
        },
        {
          label: '"I am not going to discuss it."',
          headline: 'GM tight-lipped on trade',
        },
      ],
    });
    return;
  }
  if (st && st.kind === 'L' && st.n >= 4) {
    save.press = make({
      topic: 'losing',
      question: `${st.n} losses in a row. What is going wrong?`,
      answers: [
        {
          label: '"That is on me. I will fix it."',
          team: 1,
          owner: -0.5,
          headline: 'GM takes the blame',
        },
        {
          label: '"The players need to play harder."',
          team: -1.5,
          owner: 1,
          headline: 'GM calls out his players',
        },
        {
          label: '"It is a long season. We will be fine."',
          team: 0.5,
          headline: 'GM stays calm during slump',
        },
      ],
    });
    return;
  }
  if (st && st.kind === 'W' && st.n >= 6) {
    save.press = make({
      topic: 'winning',
      question: `${st.n} straight wins. Is this a championship team?`,
      answers: [
        {
          label: '"Yes. Anything less than a title is a failure."',
          team: 1,
          owner: 2,
          headline: 'GM: title or bust',
        },
        {
          label: '"We take it one game at a time."',
          team: 0.5,
          headline: 'GM keeps the hype in check',
        },
        {
          label: '"The credit belongs to the players."',
          team: 1.5,
          headline: 'GM praises his players',
        },
      ],
    });
    return;
  }
  if (save.season.phase === 'playoffs' && !save.season.series.some((s) => s.round >= 2)) {
    save.press = make({
      topic: 'playoffs',
      question: 'The playoffs are here. What is the goal?',
      answers: [
        {
          label: '"Win it all."',
          team: 1,
          owner: 1,
          headline: 'GM sets title target',
        },
        {
          label: '"Win a round and grow from it."',
          team: 0.5,
          headline: 'Modest goals from the GM',
        },
        {
          label: '"Playoff experience is the point for this group."',
          team: -0.5,
          owner: -1,
          headline: 'GM lowers expectations',
        },
      ],
    });
    return;
  }
  if (save.season.phase === 'regular' && rng.chance(0.15)) {
    save.press = make({
      topic: 'youth',
      question: 'How do you balance playing the young guys and winning now?',
      answers: [
        {
          label: '"Minutes are earned. Winning comes first."',
          team: 0.5,
          owner: 0.5,
          headline: 'GM: minutes are earned',
        },
        {
          label: '"Our young players are the future and will play."',
          team: 0.5,
          headline: 'GM backs the kids',
        },
      ],
    });
  }
}

/** Answer the waiting press conference. */
export function answerPress(original: SaveGame, index: number): SaveGame {
  const pc = original.press;
  const a = pc?.answers[index];
  if (!pc || !a) return original;
  const save = structuredClone(original);
  const days = 21;
  if (a.team) addMod(save, null, a.team, `Reacted to your press conference: ${a.headline}.`, days);
  if (a.player && pc.playerId) addMod(save, pc.playerId, a.player, `Heard what you said about him: ${a.headline}.`, days + 10);
  if (a.owner) {
    const f = finance(save);
    f.confidence = Math.max(0, Math.min(100, f.confidence + a.owner));
  }
  save.season.rumors = [a.headline, ...(save.season.rumors ?? [])].slice(0, 6);
  save.press = null;
  return save;
}
