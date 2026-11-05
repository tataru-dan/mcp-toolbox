import type { Request, Response } from "express";
import { toolDefs } from "./toolDefs.js";
import { SUPPORTED_VERSIONS, jsonRpcError, validateProtocolVersion } from "./protocolVersion.js";

const SERVER_INFO = { name: "mcp-toolbox", version: "0.1.0" };

function serverMeta() {
  return { "io.modelcontextprotocol/serverInfo": SERVER_INFO };
}

function validateStandardHeaders(req: Request, res: Response): boolean {
  const id = req.body?.id;
  const method = req.body?.method;
  const mcpMethod = req.header("mcp-method");
  if (mcpMethod !== method) {
    jsonRpcError(res, id, 400, -32020, `Header mismatch: Mcp-Method '${mcpMethod}' does not match body method '${method}'`);
    return false;
  }
  if (method === "tools/call") {
    const name = req.body?.params?.name;
    const mcpName = req.header("mcp-name");
    if (mcpName !== name) {
      jsonRpcError(res, id, 400, -32020, `Header mismatch: Mcp-Name '${mcpName}' does not match body params.name '${name}'`);
      return false;
    }
  }
  return true;
}

export function handleDiscover(req: Request, res: Response) {
  const id = req.body?.id;
  if (!validateProtocolVersion(req, res).ok) return;
  res.json({
    jsonrpc: "2.0",
    id,
    result: {
      resultType: "complete",
      supportedVersions: SUPPORTED_VERSIONS,
      capabilities: { tools: { listChanged: true } },
      _meta: serverMeta(),
      instructions: "Save notes with memo_write, find them with memo_search, host files with upload, and transcribe audio URLs with transcribe.",
    },
  });
}

export function handleModernRequest(req: Request, res: Response) {
  const id = req.body?.id;
  const method = req.body?.method;

  if (!validateProtocolVersion(req, res).ok) return;
  if (!validateStandardHeaders(req, res)) return;

  if (method === "tools/list") {
    res.json({
      jsonrpc: "2.0",
      id,
      result: {
        resultType: "complete",
        tools: toolDefs.map((d) => ({
          name: d.name,
          title: d.title,
          description: d.description,
          inputSchema: d.inputSchema,
          outputSchema: d.outputSchema,
        })),
        _meta: serverMeta(),
      },
    });
    return;
  }

  if (method === "tools/call") {
    const name = req.body?.params?.name;
    const args = req.body?.params?.arguments ?? {};
    const def = toolDefs.find((d) => d.name === name);
    if (!def) {
      jsonRpcError(res, id, 404, -32601, `Method not found: unknown tool '${name}'`);
      return;
    }
    def
      .handler(args)
      .then((result) => {
        res.json({
          jsonrpc: "2.0",
          id,
          result: { resultType: "complete", ...result, _meta: serverMeta() },
        });
      })
      .catch((err: Error) => {
        res.json({
          jsonrpc: "2.0",
          id,
          result: {
            resultType: "complete",
            isError: true,
            content: [{ type: "text", text: err.message }],
            _meta: serverMeta(),
          },
        });
      });
    return;
  }

  res.status(404).json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
}
