import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CouncilInput, CouncilSession } from '../types';

const KEY = 'council.sessions.v1';
const MAX_SESSIONS = 100;

async function readAll(): Promise<CouncilSession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CouncilSession[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(sessions: CouncilSession[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
}

/** Newest first. */
export async function listSessions(): Promise<CouncilSession[]> {
  return readAll();
}

export async function getSession(id: string): Promise<CouncilSession | undefined> {
  return (await readAll()).find((s) => s.id === id);
}

export async function createSession(input: CouncilInput): Promise<CouncilSession> {
  const session: CouncilSession = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    createdAt: new Date().toISOString(),
    input,
    status: 'running',
    seats: {},
  };
  await writeAll([session, ...(await readAll())]);
  return session;
}

export async function saveSession(session: CouncilSession): Promise<void> {
  const all = await readAll();
  const i = all.findIndex((s) => s.id === session.id);
  if (i === -1) all.unshift(session);
  else all[i] = session;
  await writeAll(all);
}

export async function deleteSession(id: string): Promise<void> {
  await writeAll((await readAll()).filter((s) => s.id !== id));
}
