import { randomBytes, createHash } from "node:crypto";

const BASE = "http://localhost:8787";
const OWNER_CODE = "test123";
const REDIRECT_URI = "http://127.0.0.1:9999/cb";

function b64url(buf) {
  return buf.toString("base64url");
}

async function main() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());

  const reg = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "smoke-test", redirect_uris: [REDIRECT_URI] }),
  }).then((r) => r.json());
  console.log("register:", reg);

  const authUrl = new URL(`${BASE}/authorize`);
  authUrl.searchParams.set("client_id", reg.client_id);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", "xyz");
  const authPage = await fetch(authUrl).then((r) => r.text());
  const authId = authPage.match(/name="authId" value="([^"]+)"/)?.[1];
  console.log("authId:", authId);
  if (!authId) throw new Error("no authId found:\n" + authPage);

  const approveRes = await fetch(`${BASE}/authorize/approve`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    redirect: "manual",
    body: new URLSearchParams({ authId, ownerCode: OWNER_CODE }),
  });
  console.log("approve status:", approveRes.status);
  const location = approveRes.headers.get("location");
  console.log("location:", location);
  if (!location) throw new Error("no redirect from approve: " + (await approveRes.text()));
  const code = new URL(location).searchParams.get("code");

  const tokenRes = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: reg.client_id,
      code_verifier: verifier,
    }),
  }).then((r) => r.json());
  console.log("token:", tokenRes);
  const accessToken = tokenRes.access_token;
  if (!accessToken) throw new Error("no access token");

  async function rpc(method, params) {
    const res = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
    const text = await res.text();
    console.log(`\n--- ${method} (status ${res.status}) ---`);
    console.log(text.slice(0, 2000));
    try {
      const line = text.split("\n").find((l) => l.startsWith("data:"));
      return JSON.parse(line ? line.slice(5) : text);
    } catch {
      return text;
    }
  }

  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "0.0.1" },
  });
  await rpc("notifications/initialized", {});
  await rpc("tools/list", {});
  await rpc("tools/call", { name: "memo_write", arguments: { text: "hello from smoke test" } });
  await rpc("tools/call", { name: "memo_search", arguments: { query: "hello" } });
  await rpc("tools/call", {
    name: "upload",
    arguments: { filename: "note.txt", contentBase64: Buffer.from("hi there").toString("base64") },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
