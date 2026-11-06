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
import { PlayerPage } from './ui/screens/PlayerPage';
import { Roster } from './ui/screens/Roster';
import { More, Settings, Staff } from './ui/screens/StaffAndSettings';

export function App() {
  const path = useRoute();
  const [first] = path;
  if (first === 'new') return <NewCareer />;
  if (first === 'c' && path[1]) return <Career saveId={path[1]} rest={path.slice(2)} />;
  return <MainMenu />;
}

function Career({ saveId, rest }: { saveId: string; rest: string[] }) {
  const [save, setSave] = useState<SaveGame | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setSave(undefined);
    loadSave(saveId)
      .then((s) => live && setSave(s ?? null))
      .catch(() => live && setSave(null));
    return () => {
      live = false;
    };
  }, [saveId]);

  if (save === undefined) return <div className="loading">Loading career…</div>;
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
  const sectionForNav = section === 'player' ? 'roster' : section === 'team' ? 'league' : section;
  return (
    <CareerProvider key={save.id} initial={save}>
      <Shell section={sectionForNav}>
        {section === 'home' && <Home messageId={arg} />}
        {section === 'roster' && <Roster />}
        {section === 'player' && arg && <PlayerPage playerId={arg} />}
        {section === 'league' && <League />}
        {section === 'team' && arg && <TeamPage teamId={arg} />}
        {section === 'finances' && <Finances />}
        {section === 'staff' && <Staff />}
        {section === 'settings' && <Settings />}
        {section === 'more' && <More />}
      </Shell>
    </CareerProvider>
  );
}
