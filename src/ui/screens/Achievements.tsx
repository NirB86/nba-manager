import { useEffect } from 'react';
import { ACHIEVEMENTS, markAchievementsSeen } from '../../game/achievements';
import { useCareer } from '../career-context';
import { Card } from '../components';
import { seasonLabel } from '../format';
import { PageHeader } from '../Shell';

export function Achievements() {
  const { save, update } = useCareer();
  // Seen here: no need for the toast.
  useEffect(() => {
    if (save.achievements?.some((a) => !a.seen)) update(markAchievementsSeen);
  }, [save.achievements]); // eslint-disable-line react-hooks/exhaustive-deps
  const got = new Map((save.achievements ?? []).map((a) => [a.id, a]));
  return (
    <>
      <PageHeader title="Achievements" subtitle={`${got.size} of ${ACHIEVEMENTS.length} unlocked in this career`} />
      <Card>
        <ul className="ach-grid">
          {[...ACHIEVEMENTS]
            .sort((a, b) => Number(got.has(b.id)) - Number(got.has(a.id)))
            .map((a) => {
              const u = got.get(a.id);
              return (
                <li key={a.id} className={u ? 'got' : 'locked'}>
                  <span className="ach-icon" aria-hidden>
                    {a.icon}
                  </span>
                  <span>
                    <strong>{a.title}</strong>
                    <small>{a.text}</small>
                    {u && <small>Unlocked {seasonLabel(u.season)}</small>}
                  </span>
                </li>
              );
            })}
        </ul>
      </Card>
    </>
  );
}
