import { randomUUID } from "node:crypto";

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

interface StoreData {
  memos: Memo[];
  clients: Record<string, OAuthClient>;
  tokens: Record<string, AccessTokenRecord>;
}

const GIST_ID = process.env.GIST_ID ?? "";
const GIST_TOKEN = process.env.GIST_TOKEN ?? "";
const GIST_FILE = "store.json";

let cache: StoreData | null = null;

async function githubFetch(method: string, body?: unknown) {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method,
    headers: {
      Authorization: `Bearer ${GIST_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "mcp-toolbox",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub Gist API ${method} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function load(): Promise<StoreData> {
  if (cache) return cache;
  if (!GIST_ID || !GIST_TOKEN) {
    cache = { memos: [], clients: {}, tokens: {} };
    return cache;
  }
  const gist = (await githubFetch("GET")) as { files: Record<string, { content: string }> };
  const content = gist.files[GIST_FILE]?.content ?? "{}";
  const parsed = JSON.parse(content);
  cache = { memos: parsed.memos ?? [], clients: parsed.clients ?? {}, tokens: parsed.tokens ?? {} };
  return cache;
}

async function save(): Promise<void> {
  if (!cache) return;
  if (!GIST_ID || !GIST_TOKEN) return;
  await githubFetch("PATCH", { files: { [GIST_FILE]: { content: JSON.stringify(cache) } } });
}

export const memos = {
  async write(text: string): Promise<Memo> {
    const data = await load();
    const memo: Memo = { id: randomUUID(), text, createdAt: new Date().toISOString() };
    data.memos.push(memo);
    await save();
    return memo;
  },
  async search(query: string): Promise<Memo[]> {
    const data = await load();
    const q = query.trim().toLowerCase();
    if (!q) return data.memos;
    return data.memos.filter((m) => m.text.toLowerCase().includes(q));
  },
};

export const clients = {
  async register(clientName: string, redirectUris: string[]): Promise<OAuthClient> {
    const data = await load();
    const client: OAuthClient = { clientId: randomUUID(), clientName, redirectUris };
    data.clients[client.clientId] = client;
    await save();
    return client;
  },
  async get(clientId: string): Promise<OAuthClient | undefined> {
    const data = await load();
    return data.clients[clientId];
  },
};

export const tokens = {
  async issue(clientId: string): Promise<string> {
    const data = await load();
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    data.tokens[token] = { token, clientId, createdAt: new Date().toISOString() };
    await save();
    return token;
  },
  async check(token: string): Promise<AccessTokenRecord | undefined> {
    const data = await load();
    return data.tokens[token];
  },
};
