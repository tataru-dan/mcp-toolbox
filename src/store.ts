import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

function jsonFile<T>(path: string, fallback: T) {
  mkdirSync(dirname(path), { recursive: true });
  let data: T = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
  const save = () => writeFileSync(path, JSON.stringify(data, null, 2));
  if (!existsSync(path)) save();
  return {
    get: () => data,
    set: (next: T) => {
      data = next;
      save();
    },
  };
}

export interface Memo {
  id: string;
  text: string;
  createdAt: string;
}

export interface OAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
}

export interface AccessTokenRecord {
  token: string;
  clientId: string;
  createdAt: string;
}

const dataDir = process.env.DATA_DIR ?? "data";

const memoStore = jsonFile<Memo[]>(`${dataDir}/memos.json`, []);
const clientStore = jsonFile<Record<string, OAuthClient>>(`${dataDir}/clients.json`, {});
const tokenStore = jsonFile<Record<string, AccessTokenRecord>>(`${dataDir}/tokens.json`, {});

export const memos = {
  write(text: string): Memo {
    const memo: Memo = { id: randomUUID(), text, createdAt: new Date().toISOString() };
    memoStore.set([...memoStore.get(), memo]);
    return memo;
  },
  search(query: string): Memo[] {
    const q = query.trim().toLowerCase();
    const all = memoStore.get();
    if (!q) return all;
    return all.filter((m) => m.text.toLowerCase().includes(q));
  },
  newest(): Memo | undefined {
    const all = memoStore.get();
    return all[all.length - 1];
  },
};

export const clients = {
  register(clientName: string, redirectUris: string[]): OAuthClient {
    const client: OAuthClient = { clientId: randomUUID(), clientName, redirectUris };
    clientStore.set({ ...clientStore.get(), [client.clientId]: client });
    return client;
  },
  get(clientId: string): OAuthClient | undefined {
    return clientStore.get()[clientId];
  },
};

export const tokens = {
  issue(clientId: string): string {
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    tokenStore.set({
      ...tokenStore.get(),
      [token]: { token, clientId, createdAt: new Date().toISOString() },
    });
    return token;
  },
  check(token: string): AccessTokenRecord | undefined {
    return tokenStore.get()[token];
  },
};
