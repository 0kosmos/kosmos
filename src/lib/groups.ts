import { API_BASE } from "./config";

// Steam groups (through our Worker): your groups, search, and one group's details.

export interface GroupCard {
  url: string; // the group's address name: steamcommunity.com/groups/<url>
  name: string;
  avatar: string;
  members: number;
  summary?: string;
  headline?: string;
}

export interface Person {
  steamid: string;
  name: string;
  avatar: string;
  online: boolean;
}

export interface GroupDetail extends GroupCard {
  id: string;
  headline: string;
  summary: string;
  online: number;
  inGame: number;
  inChat: number;
  admins: Person[];
  mods: Person[];
}

const TTL = 15 * 60 * 1000;
const memory = new Map<string, { data: unknown; at: number }>();

async function get<T>(path: string): Promise<T> {
  const hit = memory.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error("Request failed");
  const data = (await res.json()) as T;
  if (memory.size > 40) memory.delete(memory.keys().next().value!);
  memory.set(path, { data, at: Date.now() });
  return data;
}

export const fetchMyGroups = (steamid: string) =>
  get<{ private: boolean; groups: GroupCard[] }>(`/groups/mine?steamid=${steamid}`);

export const searchGroups = (q: string, page = 1) =>
  get<{ items: GroupCard[]; total: number; next: number }>(`/groups/search?q=${encodeURIComponent(q)}&page=${page}`);

export const fetchGroup = (url: string) => get<GroupDetail>(`/groups/detail?url=${encodeURIComponent(url)}`);

/** The group's page in the Steam client (where you can join it) */
export const groupPageLink = (url: string) =>
  `steam://openurl/https://steamcommunity.com/groups/${encodeURIComponent(url)}`;
