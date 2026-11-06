// Cloud: sign-in and the private NBA league download (Supabase).
// The league lives in a private storage bucket that only signed-in users can
// read, so real NBA data never sits on the public site or in the repo.

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { validateLeague, type LeagueFile } from '../engine';
import { CLOUD_CONFIG } from './config';

export interface LeagueManifest {
  version: string;
  file: string;
  name: string;
  season: number;
  updatedAt: string;
  players: number;
  photos: number;
}

export interface CachedLeague {
  manifest: LeagueManifest;
  league: LeagueFile;
}

let client: SupabaseClient | null = null;

export function cloudConfigured(): boolean {
  return !!CLOUD_CONFIG.url && !!CLOUD_CONFIG.publishableKey;
}

export function cloud(): SupabaseClient | null {
  if (!cloudConfigured()) return null;
  client ??= createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

export async function currentUser(): Promise<User | null> {
  const c = cloud();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user ?? null;
}

export async function signIn(email: string, password: string): Promise<void> {
  const c = cloud();
  if (!c) throw new Error('Cloud is not set up yet.');
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendly(error.message));
}

/** Creates an account. Returns true when the user must confirm their email first. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const c = cloud();
  if (!c) throw new Error('Cloud is not set up yet.');
  const { data, error } = await c.auth.signUp({ email, password });
  if (error) throw new Error(friendly(error.message));
  return !data.session;
}

export async function signOut(): Promise<void> {
  await cloud()?.auth.signOut();
}

function friendly(message: string): string {
  if (/invalid login/i.test(message)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: open the link we sent you, then sign in here.';
  if (/already registered/i.test(message)) return 'That email already has an account. Sign in instead.';
  if (/password/i.test(message) && /least/i.test(message)) return 'Use a password of at least 6 characters.';
  return message;
}

async function download(path: string): Promise<Blob> {
  const c = cloud();
  if (!c) throw new Error('Cloud is not set up yet.');
  const { data, error } = await c.storage.from(CLOUD_CONFIG.bucket).download(path);
  if (error || !data) throw new Error(error?.message ?? 'Download failed.');
  return data;
}

export async function fetchManifest(): Promise<LeagueManifest> {
  const blob = await download('manifest.json');
  return JSON.parse(await blob.text()) as LeagueManifest;
}

export async function fetchLeague(manifest: LeagueManifest): Promise<LeagueFile> {
  const blob = await download(manifest.file);
  const data: unknown = JSON.parse(await blob.text());
  const check = validateLeague(data);
  if (!check.ok) throw new Error(`The league file is invalid: ${check.errors[0]}`);
  return data as LeagueFile;
}
