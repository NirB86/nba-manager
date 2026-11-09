import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { putSave, type SaveGame } from '../storage/saves';
import { schedulePush } from '../cloud/saves-cloud';

interface CareerCtx {
  save: SaveGame;
  /** Apply a change and persist it to the device. */
  update: (fn: (save: SaveGame) => SaveGame) => void;
}

const Ctx = createContext<CareerCtx | null>(null);

export function CareerProvider({ initial, children }: { initial: SaveGame; children: ReactNode }) {
  const [save, setSave] = useState(initial);
  const latest = useRef(initial);

  const update = useCallback((fn: (s: SaveGame) => SaveGame) => {
    const next = fn(latest.current);
    latest.current = next;
    setSave(next);
    // Saved on the device, then copied to the cloud a few seconds after the last change.
    void putSave(next).then(schedulePush);
  }, []);

  const value = useMemo(() => ({ save, update }), [save, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The career, or null outside one (menus, new career). */
export function useOptionalCareer(): CareerCtx | null {
  return useContext(Ctx);
}

export function useCareer(): CareerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCareer outside CareerProvider');
  return ctx;
}
