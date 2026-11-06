import { useMemo, useRef, useState } from 'react';
import {
  CAP_STATUS_LABEL,
  capStatus,
  generateLeague,
  newSeed,
  teamName,
  teamSummaries,
  validateLeague,
  type LeagueFile,
} from '../../engine';
import { TIER_LABEL, createCareer, ownerExpectation } from '../../game/career';
import { putSave, requestPersistence, type CareerSettings, type Difficulty, type Role, type ScoutingDepth, type SimMode } from '../../storage/saves';
import { Ovr, Segmented, TeamBadge } from '../components';
import { money, seasonLabel } from '../format';
import { href, navigate } from '../router';

type Step = 'league' | 'team' | 'options';

export function NewCareer() {
  const [step, setStep] = useState<Step>('league');
  const [seed, setSeed] = useState(newSeed);
  const [imported, setImported] = useState<LeagueFile | null>(null);
  const [importMsg, setImportMsg] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('gm');
  const [simMode, setSimMode] = useState<SimMode>('ask');
  const [scouting, setScouting] = useState<ScoutingDepth>('light');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const league = useMemo(() => imported ?? generateLeague({ seed }), [imported, seed]);
  const summaries = useMemo(() => {
    const ranked = teamSummaries(league).sort((a, b) => b.rating - a.rating);
    return ranked.map((s, i) => ({ ...s, rank: i + 1 }));
  }, [league]);
  const chosen = summaries.find((s) => s.team.id === teamId);

  const onLeagueFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      const result = validateLeague(data);
      setImportMsg({ errors: result.errors, warnings: result.warnings.slice(0, 5) });
      if (result.ok) {
        setImported(data as LeagueFile);
        setTeamId(null);
      }
    } catch {
      setImportMsg({ errors: ['That file is not valid JSON.'], warnings: [] });
    }
  };

  const start = async () => {
    if (!chosen) return;
    setBusy(true);
    const settings: CareerSettings = { teamId: chosen.team.id, role, simMode, scouting, difficulty };
    const save = createCareer(structuredClone(league), settings, name.trim() || `${teamName(chosen.team)} career`);
    await putSave(save);
    void requestPersistence();
    navigate('c', save.id, 'home');
  };

  const tierLabel = (teamId: string) => TIER_LABEL[ownerExpectation(league, teamId).tier];

  return (
    <div className="wizard">
      <header className="wizard-head">
        <a className="back-link" href={href()}>
          ← Main menu
        </a>
        <h1>New career</h1>
        <ol className="steps">
          {(['league', 'team', 'options'] as Step[]).map((s, i) => (
            <li key={s} className={s === step ? 'on' : ''}>
              <span>{i + 1}</span> {s === 'league' ? 'League' : s === 'team' ? 'Team' : 'Your role'}
            </li>
          ))}
        </ol>
      </header>

      {step === 'league' && (
        <div className="wizard-body">
          <div className="choice-grid">
            <button type="button" className={`choice ${!imported ? 'on' : ''}`} onClick={() => setImported(null)}>
              <strong>Fictional league</strong>
              <span className="muted">30 invented franchises with generated players, coaches and contracts. A new league every time.</span>
              <span className="small muted">League #{seed}</span>
            </button>
            <button type="button" className={`choice ${imported ? 'on' : ''}`} onClick={() => fileInput.current?.click()}>
              <strong>Load a league file</strong>
              <span className="muted">Use a league file you made or downloaded, such as real NBA rosters from the import tool.</span>
              {imported && <span className="small">Loaded: {imported.meta.name}</span>}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                void onLeagueFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          {importMsg && importMsg.errors.length > 0 && (
            <div className="error-box">
              <strong>That league file has problems:</strong>
              <ul>{importMsg.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
          {!imported && (
            <button type="button" className="btn btn-ghost" onClick={() => { setSeed(newSeed()); setTeamId(null); }}>
              ↻ Generate a different league
            </button>
          )}
          <div className="wizard-foot">
            <span className="muted small">
              {league.teams.length} teams · {league.players.filter((p) => p.teamId).length} rostered players · {seasonLabel(league.meta.season)}
            </span>
            <button type="button" className="btn btn-primary" onClick={() => setStep('team')}>
              Next: choose a team
            </button>
          </div>
        </div>
      )}

      {step === 'team' && (
        <div className="wizard-body">
          {league.conferences.map((conf) => (
            <section key={conf.id}>
              <h2 className="section-title">{conf.name}</h2>
              <div className="team-grid">
                {summaries
                  .filter((s) => s.team.conferenceId === conf.id)
                  .sort((a, b) => a.team.city.localeCompare(b.team.city))
                  .map((s) => (
                    <button
                      key={s.team.id}
                      type="button"
                      className={`team-card ${teamId === s.team.id ? 'on' : ''}`}
                      onClick={() => setTeamId(s.team.id)}
                      style={{ ['--team' as string]: s.team.colors.primary }}
                    >
                      <TeamBadge team={s.team} size={44} />
                      <span className="team-card-text">
                        <strong>{teamName(s.team)}</strong>
                        <span className="muted small">
                          {tierLabel(s.team.id)} · {money(s.payroll)} · {CAP_STATUS_LABEL[capStatus(league.settings, s.payroll)]}
                        </span>
                      </span>
                      <Ovr value={s.rating} label="Team rating" />
                    </button>
                  ))}
              </div>
            </section>
          ))}
          <div className="wizard-foot sticky">
            <button type="button" className="btn" onClick={() => setStep('league')}>
              Back
            </button>
            <span className="muted small grow">{chosen ? `${teamName(chosen.team)}: ranked ${chosen.rank} of ${summaries.length}` : 'Pick a team to manage'}</span>
            <button type="button" className="btn btn-primary" disabled={!chosen} onClick={() => setStep('options')}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 'options' && chosen && (
        <div className="wizard-body narrow">
          <div className="chosen-team">
            <TeamBadge team={chosen.team} size={56} />
            <div>
              <h2>{teamName(chosen.team)}</h2>
              <p className="muted">{tierLabel(chosen.team.id)} · team rating {chosen.rating} (ranked {chosen.rank})</p>
            </div>
          </div>

          <label className="field">
            <span>Your role</span>
            <Segmented
              name="Your role"
              value={role}
              onChange={setRole}
              options={[
                { value: 'gm', label: 'General Manager', hint: 'Build the roster; your coach runs games' },
                { value: 'gm-coach', label: 'GM + Head Coach', hint: 'You also set rotations and call plays' },
              ]}
            />
          </label>
          <label className="field">
            <span>Games</span>
            <Segmented
              name="Games"
              value={simMode}
              onChange={setSimMode}
              options={[
                { value: 'watch', label: 'Watch', hint: '2D play-by-play' },
                { value: 'quick', label: 'Quick sim', hint: 'Box score only' },
                { value: 'ask', label: 'Ask each game' },
              ]}
            />
          </label>
          <label className="field">
            <span>Scouting depth</span>
            <Segmented
              name="Scouting depth"
              value={scouting}
              onChange={setScouting}
              options={[
                { value: 'light', label: 'Light', hint: 'Scouts send reports, you decide' },
                { value: 'full', label: 'Full', hint: 'G League, college and international' },
              ]}
            />
          </label>
          <label className="field">
            <span>Owner patience</span>
            <Segmented
              name="Owner patience"
              value={difficulty}
              onChange={setDifficulty}
              options={[
                { value: 'easy', label: 'Patient' },
                { value: 'normal', label: 'Normal' },
                { value: 'hard', label: 'Win now' },
              ]}
            />
          </label>
          <label className="field">
            <span>Career name</span>
            <input className="input" value={name} placeholder={`${teamName(chosen.team)} career`} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </label>
          <p className="muted small">You can change role, game mode and scouting depth later in Settings.</p>

          <div className="wizard-foot">
            <button type="button" className="btn" onClick={() => setStep('team')}>
              Back
            </button>
            <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => void start()}>
              {busy ? 'Starting…' : 'Start career'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
