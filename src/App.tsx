import { useEffect, useState } from 'react';
import { loadSave, type SaveGame } from './storage/saves';
import { CareerProvider } from './ui/career-context';
import { href, useRoute } from './ui/router';
import { Shell } from './ui/Shell';
import { Finances } from './ui/screens/Finances';
import { Home } from './ui/screens/Home';
import { League, TeamPage } from './ui/screens/League';
import { MainMenu } from './ui/screens/MainMenu';
import { NewCareer } from './ui/screens/NewCareer';
import { Account } from './ui/screens/Account';
import { cachedLeague, withLatestImages } from './cloud/sync';
import { putSave } from './storage/saves';
import { PlayerPage } from './ui/screens/PlayerPage';
import { Roster } from './ui/screens/Roster';
import { Credits, More, Settings, Staff, StaffPage } from './ui/screens/StaffAndSettings';
import { BoxScore, Schedule } from './ui/screens/Season';
import { Trade } from './ui/screens/Trade';
import { Scouting } from './ui/screens/Scouting';

export function App() {
  const path = useRoute();
  const [first] = path;
  if (first === 'account') return <div className="arena"><Account /></div>;
  if (first === 'new') return <div className="arena"><NewCareer /></div>;
  if (first === 'c' && path[1]) return <Career saveId={path[1]} rest={path.slice(2)} />;
  return <div className="arena"><MainMenu /></div>;
}

function Career({ saveId, rest }: { saveId: string; rest: string[] }) {
  const [save, setSave] = useState<SaveGame | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setSave(undefined);
    loadSave(saveId)
      .then(async (s) => {
        if (!s) return live && setSave(null);
        // Pass new photos and logos from the latest downloaded league to this career.
        const updated = withLatestImages(s, await cachedLeague());
        if (updated !== s) await putSave(updated);
        if (live) setSave(updated);
      })
      .catch(() => live && setSave(null));
    return () => {
      live = false;
    };
  }, [saveId]);

  if (save === undefined) return <div className="arena loading">Loading career…</div>;
  if (save === null) {
    return (
      <div className="loading">
        <p>That career could not be found on this device.</p>
        <a className="btn" href={href()}>
          Main menu
        </a>
      </div>
    );
  }

  const [section = 'home', arg] = rest;
  const sectionForNav = section === 'player' ? 'roster' : section === 'team' ? 'league' : section === 'game' ? 'schedule' : section === 'credits' ? 'settings' : section;
  return (
    <CareerProvider key={save.id} initial={save}>
      <Shell section={sectionForNav}>
        {section === 'home' && <Home messageId={arg} />}
        {section === 'roster' && <Roster />}
        {section === 'player' && arg && <PlayerPage key={arg} playerId={arg} />}
        {section === 'league' && <League />}
        {section === 'team' && arg && <TeamPage teamId={arg} />}
        {section === 'finances' && <Finances />}
        {section === 'staff' && !arg && <Staff />}
        {section === 'staff' && arg && <StaffPage staffId={arg} />}
        {section === 'settings' && <Settings />}
        {section === 'more' && <More />}
        {section === 'credits' && <Credits />}
        {section === 'trade' && <Trade key={arg ?? 'none'} teamId={arg} playerId={rest[2]} />}
        {section === 'schedule' && <Schedule />}
        {section === 'scouting' && <Scouting />}
        {section === 'game' && arg && <BoxScore gameId={arg} />}
      </Shell>
    </CareerProvider>
  );
}
