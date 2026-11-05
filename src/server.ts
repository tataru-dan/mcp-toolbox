import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { oauthRouter, checkBearerToken } from "./oauth.js";
import { registerTools } from "./tools.js";
import { planHtml } from "./plan.js";
import { handleDiscover, handleModernRequest } from "./modern.js";
import { isModernRequest } from "./protocolVersion.js";

const PORT = Number(process.env.PORT ?? 8787);
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(oauthRouter);
app.use("/uploads", express.static("public/uploads"));
app.get("/plan", (_req, res) => res.type("html").send(planHtml(PUBLIC_URL)));

function unauthorized(res: express.Response) {
  res
    .status(401)
    .set("WWW-Authenticate", `Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource"`)
    .json({ error: "unauthorized" });
}

function newServer() {
  const server = new McpServer({ name: "mcp-toolbox", version: "0.1.0" });
  registerTools(server);
  return server;
}

app.post("/mcp", async (req, res) => {
  if (!checkBearerToken(req.header("authorization"))) return unauthorized(res);
  if (req.body?.method === "server/discover") return handleDiscover(req, res);
  if (isModernRequest(req)) return handleModernRequest(req, res);
  const server = newServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", (req, res) => {
  if (!checkBearerToken(req.header("authorization"))) return unauthorized(res);
  res.status(405).json({ error: "method_not_allowed" });
});

app.listen(PORT, () => {
  console.log(`mcp-toolbox listening on ${PORT}, public URL ${PUBLIC_URL}`);
});
