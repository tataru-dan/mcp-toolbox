import { randomUUID, createHash } from "node:crypto";
import { Router } from "express";
import { clients, tokens } from "./store.js";

const PUBLIC_URL = process.env.PUBLIC_URL ?? "http://localhost:8787";
const OWNER_CODE = process.env.OWNER_CODE ?? "";

interface PendingAuth {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

// Authorization codes are short-lived; in-memory is fine.
const pendingAuths = new Map<string, PendingAuth>();

function base64url(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const oauthRouter = Router();

oauthRouter.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: `${PUBLIC_URL}/mcp`,
    authorization_servers: [PUBLIC_URL],
    resource_documentation: `${PUBLIC_URL}/plan`,
  });
});

oauthRouter.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: PUBLIC_URL,
    authorization_endpoint: `${PUBLIC_URL}/authorize`,
    token_endpoint: `${PUBLIC_URL}/token`,
    registration_endpoint: `${PUBLIC_URL}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

// Dynamic client registration (RFC 7591) — any client may register; it still
// needs the owner's approval at /authorize before it gets a token.
oauthRouter.post("/register", async (req, res) => {
  const { client_name, redirect_uris } = req.body ?? {};
  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    res.status(400).json({ error: "invalid_client_metadata", error_description: "redirect_uris required" });
    return;
  }
  const client = await clients.register(client_name ?? "unnamed client", redirect_uris);
  res.status(201).json({
    client_id: client.clientId,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
  });
});

oauthRouter.get("/authorize", async (req, res) => {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method } = req.query;
  const client = await clients.get(String(client_id ?? ""));
  if (!client || !client.redirectUris.includes(String(redirect_uri ?? ""))) {
    res.status(400).send("Unknown client or redirect_uri.");
    return;
  }
  if (!code_challenge || code_challenge_method !== "S256") {
    res.status(400).send("PKCE (S256) is required.");
    return;
  }
  const authId = randomUUID();
  pendingAuths.set(authId, {
    clientId: client.clientId,
    redirectUri: String(redirect_uri),
    state: state ? String(state) : undefined,
    codeChallenge: String(code_challenge),
    codeChallengeMethod: String(code_challenge_method),
  });
  res.send(`<!doctype html>
<html><body style="font-family: sans-serif; max-width: 32rem; margin: 4rem auto;">
  <h1>Let this client in?</h1>
  <p><strong>${client.clientName}</strong> wants access to your MCP server.</p>
  <form method="post" action="/authorize/approve">
    <input type="hidden" name="authId" value="${authId}" />
    <label>Owner code<br/><input type="password" name="ownerCode" autofocus /></label>
    <p><button type="submit">Approve</button></p>
  </form>
</body></html>`);
});

oauthRouter.post("/authorize/approve", (req, res) => {
  const { authId, ownerCode } = req.body ?? {};
  const pending = pendingAuths.get(String(authId ?? ""));
  if (!pending) {
    res.status(400).send("This approval link has expired. Ask the client to try again.");
    return;
  }
  if (!OWNER_CODE || ownerCode !== OWNER_CODE) {
    res.status(401).send("Wrong owner code.");
    return;
  }
  pendingAuths.delete(authId);
  const code = randomUUID();
  pendingAuths.set(`code:${code}`, pending);
  const url = new URL(pending.redirectUri);
  url.searchParams.set("code", code);
  if (pending.state) url.searchParams.set("state", pending.state);
  res.redirect(url.toString());
});

oauthRouter.post("/token", async (req, res) => {
  const { grant_type, code, redirect_uri, client_id, code_verifier } = req.body ?? {};
  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }
  const pending = pendingAuths.get(`code:${code}`);
  if (!pending || pending.clientId !== client_id || pending.redirectUri !== redirect_uri) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }
  pendingAuths.delete(`code:${code}`);
  const expected = base64url(createHash("sha256").update(String(code_verifier ?? "")).digest());
  if (expected !== pending.codeChallenge) {
    res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    return;
  }
  const token = await tokens.issue(pending.clientId);
  res.json({ access_token: token, token_type: "bearer" });
});

export async function checkBearerToken(authHeader: string | undefined): Promise<boolean> {
  const token = authHeader?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return false;
  return Boolean(await tokens.check(token));
}
