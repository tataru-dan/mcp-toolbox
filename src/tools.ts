import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { memos } from "./store.js";

const PUBLIC_URL = process.env.PUBLIC_URL ?? "http://localhost:8787";
const UPLOAD_DIR = "public/uploads";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";

export function registerTools(server: McpServer) {
  server.registerTool(
    "memo_write",
    {
      title: "Write memo",
      description: "Saves a note.",
      inputSchema: { text: z.string().describe("The note's text.") },
      outputSchema: { id: z.string() },
    },
    async ({ text }) => {
      const memo = memos.write(text);
      return {
        content: [{ type: "text", text: `Saved memo ${memo.id}` }],
        structuredContent: { id: memo.id },
      };
    },
  );

  server.registerTool(
    "memo_search",
    {
      title: "Search memos",
      description: "Finds notes whose text contains the query (case-insensitive). Empty query returns all notes.",
      inputSchema: { query: z.string() },
      outputSchema: {
        notes: z.array(z.object({ id: z.string(), text: z.string(), createdAt: z.string() })),
      },
    },
    async ({ query }) => {
      const notes = memos.search(query);
      return {
        content: [{ type: "text", text: `Found ${notes.length} note(s).` }],
        structuredContent: { notes },
      };
    },
  );

  server.registerTool(
    "upload",
    {
      title: "Upload file",
      description: "Puts a file on this server and gives back a link anyone can open.",
      inputSchema: {
        filename: z.string().describe("Original filename, used only for its extension."),
        contentBase64: z.string().describe("File bytes, base64-encoded."),
      },
      outputSchema: { url: z.string() },
    },
    async ({ filename, contentBase64 }) => {
      mkdirSync(UPLOAD_DIR, { recursive: true });
      const ext = extname(filename).slice(0, 10);
      const name = `${randomUUID()}${ext}`;
      writeFileSync(`${UPLOAD_DIR}/${name}`, Buffer.from(contentBase64, "base64"));
      const url = `${PUBLIC_URL}/uploads/${name}`;
      return {
        content: [{ type: "text", text: url }],
        structuredContent: { url },
      };
    },
  );

  server.registerTool(
    "transcribe",
    {
      title: "Transcribe audio",
      description: "Turns audio at a URL into timestamped text.",
      inputSchema: { url: z.string().url() },
      outputSchema: {
        segments: z.array(z.object({ start: z.number(), text: z.string() })),
      },
    },
    async ({ url }) => {
      const segments = await transcribeUrl(url);
      return {
        content: [{ type: "text", text: `${segments.length} segment(s) transcribed.` }],
        structuredContent: { segments },
      };
    },
  );
}

async function transcribeUrl(url: string): Promise<{ start: number; text: string }[]> {
  if (!OPENROUTER_API_KEY) throw new Error("Server has no OPENROUTER_API_KEY configured.");
  const audioRes = await fetch(url);
  if (!audioRes.ok) throw new Error(`Could not fetch audio: ${audioRes.status}`);
  const audioBlob = await audioRes.blob();

  const form = new FormData();
  form.set("file", audioBlob, "audio");
  form.set("model", "openai/whisper-1");
  form.set("response_format", "verbose_json");

  const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`OpenRouter transcription failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { segments?: { start: number; text: string }[] };
  return (data.segments ?? []).map((s) => ({ start: s.start, text: s.text.trim() }));
}
