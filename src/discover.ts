import type { Request, Response } from "express";

// Only legacy, initialize-handshake versions are actually served (via the
// installed MCP SDK). Advertising 2026-07-28 here would invite modern
// per-request clients to use headers the SDK's transport can't handle.
export const SUPPORTED_VERSIONS = ["2025-06-18"];
const SERVER_INFO = { name: "mcp-toolbox", version: "0.1.0" };

function jsonRpcError(res: Response, id: unknown, status: number, code: number, message: string, data?: unknown) {
  res.status(status).json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, data } });
}

export function handleDiscover(req: Request, res: Response) {
  const id = req.body?.id;
  const meta = req.body?.params?._meta ?? {};
  const headerVersion = req.header("mcp-protocol-version");
  const bodyVersion = meta["io.modelcontextprotocol/protocolVersion"];

  if (headerVersion && bodyVersion && headerVersion !== bodyVersion) {
    jsonRpcError(res, id, 400, -32020, `Header mismatch: MCP-Protocol-Version '${headerVersion}' does not match body value '${bodyVersion}'`);
    return;
  }
  const requested = bodyVersion ?? headerVersion;
  if (requested && !SUPPORTED_VERSIONS.includes(requested)) {
    jsonRpcError(res, id, 400, -32022, "Unsupported protocol version", {
      supported: SUPPORTED_VERSIONS,
      requested,
    });
    return;
  }

  res.json({
    jsonrpc: "2.0",
    id,
    result: {
      resultType: "complete",
      supportedVersions: SUPPORTED_VERSIONS,
      capabilities: { tools: { listChanged: true } },
      _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
      instructions: "Save notes with memo_write, find them with memo_search, host files with upload, and transcribe audio URLs with transcribe.",
    },
  });
}
