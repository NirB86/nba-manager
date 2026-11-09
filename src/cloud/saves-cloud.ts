// Cloud saves: each career is kept, compressed, in the signed-in user's own
// folder of the private "saves" bucket, so the same career can be played on
// a phone and a PC. The newest copy of each career wins.

import { listSaves, loadSave, migrate, storeSave, type SaveGame } from '../storage/saves';
import { cloud, currentUser } from './cloud';

const BUCKET = 'saves';

interface IndexEntry {
  updatedAt: string;
  name: string;
}
type CloudIndex = Record<string, IndexEntry>;

export type CloudStatus =
  | { state: 'off'; reason: string }
  | { state: 'needs-setup' }
  | { state: 'synced'; at: string; pulled: number; pushed: number }
  | { state: 'error'; message: string };

let lastStatus: CloudStatus = { state: 'off', reason: 'Sign in to keep your careers in the cloud.' };
const listeners = new Set<(s: CloudStatus) => void>();
function setStatus(s: CloudStatus) {
  lastStatus = s;
  listeners.forEach((l) => l(s));
}
export function cloudStatus(): CloudStatus {
  return lastStatus;
}
export function onCloudStatus(l: (s: CloudStatus) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

async function gzip(text: string): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') return new Blob([text], { type: 'application/json' });
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

async function gunzip(blob: Blob): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  const zipped = head[0] === 0x1f && head[1] === 0x8b;
  if (!zipped) return blob.text();
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

const isPolicyError = (m: string) => /row-level security|not authorized|unauthorized|403|policy/i.test(m);

async function context() {
  const c = cloud();
  const user = await currentUser();
  if (!c || !user) return null;
  return { c, uid: user.id };
}

async function readIndex(ctx: NonNullable<Awaited<ReturnType<typeof context>>>): Promise<CloudIndex> {
  const { data, error } = await ctx.c.storage.from(BUCKET).download(`${ctx.uid}/index.json`);
  if (error || !data) {
    if (error && isPolicyError(error.message)) throw new Error('needs-setup');
    return {};
  }
  try {
    return JSON.parse(await data.text()) as CloudIndex;
  } catch {
    return {};
  }
}

async function writeIndex(ctx: NonNullable<Awaited<ReturnType<typeof context>>>, index: CloudIndex) {
  const { error } = await ctx.c.storage.from(BUCKET).upload(`${ctx.uid}/index.json`, new Blob([JSON.stringify(index)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
  if (error) throw new Error(isPolicyError(error.message) ? 'needs-setup' : error.message);
}

async function upload(ctx: NonNullable<Awaited<ReturnType<typeof context>>>, save: SaveGame) {
  const body = await gzip(JSON.stringify(save));
  const { error } = await ctx.c.storage.from(BUCKET).upload(`${ctx.uid}/${save.id}.json.gz`, body, { upsert: true, contentType: 'application/gzip' });
  if (error) throw new Error(isPolicyError(error.message) ? 'needs-setup' : error.message);
}

/** Bring this device and the cloud up to date: newer cloud copies come down, newer local ones go up. */
export async function syncSaves(): Promise<CloudStatus> {
  const ctx = await context();
  if (!ctx) {
    setStatus({ state: 'off', reason: 'Sign in to keep your careers in the cloud.' });
    return lastStatus;
  }
  try {
    const index = await readIndex(ctx);
    const local = await listSaves();
    const localById = new Map(local.map((s) => [s.id, s]));
    let pulled = 0;
    let pushed = 0;
    for (const [id, entry] of Object.entries(index)) {
      const mine = localById.get(id);
      if (mine && mine.updatedAt >= entry.updatedAt) continue;
      const { data, error } = await ctx.c.storage.from(BUCKET).download(`${ctx.uid}/${id}.json.gz`);
      if (error || !data) continue;
      const save = migrate(JSON.parse(await gunzip(data)) as SaveGame);
      await storeSave(save);
      pulled++;
    }
    let changed = false;
    for (const s of local) {
      const remote = index[s.id];
      if (remote && remote.updatedAt >= s.updatedAt) continue;
      const save = await loadSave(s.id);
      if (!save) continue;
      await upload(ctx, save);
      index[s.id] = { updatedAt: save.updatedAt, name: save.name };
      pushed++;
      changed = true;
    }
    if (changed) await writeIndex(ctx, index);
    setStatus({ state: 'synced', at: new Date().toISOString(), pulled, pushed });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sync failed.';
    setStatus(message === 'needs-setup' ? { state: 'needs-setup' } : { state: 'error', message });
  }
  return lastStatus;
}

let pending: SaveGame | null = null;
let timer: number | null = null;

/** Upload a career a few seconds after the last change (and right away when the app goes to the background). */
export function schedulePush(save: SaveGame) {
  pending = save;
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => void flushPush(), 4000);
}

export async function flushPush(): Promise<void> {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  const save = pending;
  pending = null;
  if (!save) return;
  const ctx = await context();
  if (!ctx) return;
  try {
    await upload(ctx, save);
    const index = await readIndex(ctx);
    index[save.id] = { updatedAt: save.updatedAt, name: save.name };
    await writeIndex(ctx, index);
    setStatus({ state: 'synced', at: new Date().toISOString(), pulled: 0, pushed: 1 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Upload failed.';
    setStatus(message === 'needs-setup' ? { state: 'needs-setup' } : { state: 'error', message });
  }
}

/** Remove a career from the cloud too. */
export async function deleteCloudSave(id: string): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  try {
    await ctx.c.storage.from(BUCKET).remove([`${ctx.uid}/${id}.json.gz`]);
    const index = await readIndex(ctx);
    delete index[id];
    await writeIndex(ctx, index);
  } catch {
    // Offline or not set up: the next sync tidies up.
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flushPush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushPush();
  });
}

/** SQL for the one-time setup: each user can only reach their own folder. */
export const SETUP_SQL = `create policy "saves: read own" on storage.objects for select to authenticated
  using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "saves: add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "saves: change own" on storage.objects for update to authenticated
  using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "saves: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'saves' and (storage.foldername(name))[1] = auth.uid()::text);`;
