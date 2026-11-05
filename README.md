# mcp-toolbox

A remote MCP server with four tools — `memo_write`, `memo_search`, `upload`, `transcribe` —
served over Streamable HTTP, gated by OAuth 2.1 (PKCE + dynamic client registration).

## Run locally

```
pnpm install
cp env.sample.txt .env   # fill in OWNER_CODE, OPENROUTER_API_KEY, GIST_ID, GIST_TOKEN
pnpm dev
```

The MCP endpoint is `POST /mcp`. A new client must register (`/register`), then be approved
by the owner at `/authorize` (requires `OWNER_CODE`) before it gets an access token.

See `/plan` once running for the tool list, sign-in flow, and data retention.

## Deploy

`render.yaml` deploys this as a free Render web service. Set `OWNER_CODE`, `OPENROUTER_API_KEY`,
`PUBLIC_URL` (the service's public URL), `GIST_ID`, and `GIST_TOKEN` in the Render dashboard.

Render's free plan sleeps on idle and wipes local disk on wake, so notes, OAuth clients, and
tokens are kept in a private GitHub Gist instead (`GIST_ID`), updated via a personal access
token scoped to `gist` only (`GIST_TOKEN`). Uploaded files still live on local disk and are
lost on redeploy or sleep/wake.
