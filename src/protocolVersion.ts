import type { Request, Response } from "express";

export const MODERN_VERSION = "2026-07-28";
export const LEGACY_VERSION = "2025-06-18";
export const SUPPORTED_VERSIONS = [MODERN_VERSION, LEGACY_VERSION];

export function jsonRpcError(res: Response, id: unknown, status: number, code: number, message: string, data?: unknown) {
  res.status(status).json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, data } });
}

/** True when this request declares the modern (2026-07-28), per-request-metadata protocol. */
export function isModernRequest(req: Request): boolean {
  const headerVersion = req.header("mcp-protocol-version");
  const bodyVersion = req.body?.params?._meta?.["io.modelcontextprotocol/protocolVersion"];
  return headerVersion === MODERN_VERSION || bodyVersion === MODERN_VERSION;
}

/**
 * Validates MCP-Protocol-Version header vs body `_meta` and against what we support.
 * Writes an error response and returns {ok: false} on failure (caller must stop);
 * otherwise returns {ok: true, version} — version is undefined for a bare probe.
 */
export function validateProtocolVersion(req: Request, res: Response): { ok: true; version?: string } | { ok: false } {
  const id = req.body?.id;
  const headerVersion = req.header("mcp-protocol-version");
  const bodyVersion = req.body?.params?._meta?.["io.modelcontextprotocol/protocolVersion"];

  if (headerVersion && bodyVersion && headerVersion !== bodyVersion) {
    jsonRpcError(res, id, 400, -32020, `Header mismatch: MCP-Protocol-Version '${headerVersion}' does not match body value '${bodyVersion}'`);
    return { ok: false };
  }
  const requested = bodyVersion ?? headerVersion;
  if (requested && !SUPPORTED_VERSIONS.includes(requested)) {
    jsonRpcError(res, id, 400, -32022, "Unsupported protocol version", {
      supported: SUPPORTED_VERSIONS,
      requested,
    });
    return { ok: false };
  }
  return { ok: true, version: requested };
}
