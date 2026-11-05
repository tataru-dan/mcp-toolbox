# mcp-toolbox

A remote MCP server with four tools — `memo_write`, `memo_search`, `upload`, `transcribe` —
served over Streamable HTTP, gated by OAuth 2.1 (PKCE + dynamic client registration).

## Run locally

```
pnpm install
cp env.sample.txt .env   # fill in OWNER_CODE and GROQ_API_KEY
pnpm dev
```

The MCP endpoint is `POST /mcp`. A new client must register (`/register`), then be approved
by the owner at `/authorize` (requires `OWNER_CODE`) before it gets an access token.

See `/plan` once running for the tool list, sign-in flow, and data retention.

## Deploy

`render.yaml` deploys this as a free Render web service. Set `OWNER_CODE`, `GROQ_API_KEY`,
and `PUBLIC_URL` (the service's public URL) in the Render dashboard.
