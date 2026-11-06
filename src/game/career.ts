import {
  CAP_STATUS_LABEL,
  Rng,
  newSeason,
  newSeed,
  capStatus,
  fullName,
  playerAge,
  playerOverall,
  teamName,
  teamPayroll,
  teamSummaries,
  type LeagueFile,
} from '../engine';
import { money, seasonLabel } from '../ui/format';
import { SAVE_FORMAT, SAVE_VERSION, newSaveId, type CareerSettings, type InboxMessage, type SaveGame } from '../storage/saves';

export interface Expectation {
  goal: string;
  tier: 'title' | 'contender' | 'playoffs' | 'play-in' | 'rebuild';
}

export const TIER_LABEL: Record<Expectation['tier'], string> = {
  title: 'Title favorite',
  contender: 'Contender',
  playoffs: 'Playoff team',
  'play-in': 'Bubble team',
  rebuild: 'Rebuild',
};

/** What the owner expects, from the team's league rank by rating. */
export function ownerExpectation(league: LeagueFile, teamId: string): Expectation & { rank: number } {
  const ranked = teamSummaries(league).sort((a, b) => b.rating - a.rating);
  const rank = ranked.findIndex((s) => s.team.id === teamId) + 1;
  if (rank <= 4) return { rank, tier: 'title', goal: 'Win the championship' };
  if (rank <= 10) return { rank, tier: 'contender', goal: 'Reach the conference finals' };
  if (rank <= 18) return { rank, tier: 'playoffs', goal: 'Make the playoffs' };
  if (rank <= 24) return { rank, tier: 'play-in', goal: 'Compete for a play-in spot' };
  return { rank, tier: 'rebuild', goal: 'Develop young players and build for the future' };
}

export function createCareer(league: LeagueFile, career: CareerSettings, name: string): SaveGame {
  const now = new Date().toISOString();
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    id: newSaveId(),
    name,
    createdAt: now,
    updatedAt: now,
    career,
    inbox: welcomeMessages(league, career),
    league,
    season: newSeason(league, new Rng(newSeed())),
  };
}

function welcomeMessages(league: LeagueFile, career: CareerSettings): InboxMessage[] {
  const team = league.teams.find((t) => t.id === career.teamId);
  if (!team) return [];
  const season = league.meta.season;
  const date = `${seasonLabel(season)} preseason`;
  const exp = ownerExpectation(league, team.id);
  const payroll = teamPayroll(league, team.id, season);
  const status = capStatus(league.settings, payroll);
  const hc = league.staff.find((s) => s.teamId === team.id && s.role === 'HC');
  const scout = league.staff.find((s) => s.teamId === team.id && s.role === 'SCOUT');
  const topFa = league.players
    .filter((p) => p.teamId === null)
    .sort((a, b) => playerOverall(b) - playerOverall(a))[0];

  const patience = { easy: 'I am a patient owner', normal: 'I expect steady progress', hard: 'I expect results right away' }[
    career.difficulty
  ];

  const msgs: InboxMessage[] = [
    {
      id: 'welcome',
      from: 'Team owner',
      subject: `Welcome to the ${teamName(team)}`,
      body: `You are our new ${career.role === 'gm' ? 'General Manager' : 'General Manager and Head Coach'}. Our roster ranks ${exp.rank} of ${league.teams.length} in the league. This season the goal is clear: ${exp.goal.toLowerCase()}. ${patience}. Good luck.`,
      date,
      read: false,
    },
    {
      id: 'cap-report',
      from: 'Assistant GM',
      subject: 'Where we stand financially',
      body: `Our payroll for ${seasonLabel(season)} is ${money(payroll)} (${CAP_STATUS_LABEL[status].toLowerCase()}). The salary cap is ${money(league.settings.salaryCap)}, the luxury tax line ${money(league.settings.luxuryTax)} and the second apron ${money(league.settings.secondApron)}. The full cap sheet is under Finances.`,
      date,
      read: false,
    },
  ];
  if (scout && topFa) {
    msgs.push({
      id: 'scout-fa',
      from: `${fullName(scout)} (Scout)`,
      subject: 'Best player still on the market',
      body: `${fullName(topFa)}, a ${playerAge(topFa, season)}-year-old ${topFa.position}, is the best unsigned player. Signing free agents arrives in a coming update; keep him in mind.`,
      date,
      read: false,
    });
  }
  if (career.role === 'gm' && hc) {
    msgs.push({
      id: 'coach-intro',
      from: `${fullName(hc)} (Head Coach)`,
      subject: 'Looking forward to working together',
      body: `I will run the rotation and game plans. Let me know the direction you want for the roster and I will build the system around it.`,
      date,
      read: false,
    });
  }
  return msgs;
}
