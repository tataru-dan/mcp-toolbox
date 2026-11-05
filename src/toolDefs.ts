import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { z } from "zod";
import { memos } from "./store.js";

const PUBLIC_URL = process.env.PUBLIC_URL ?? "http://localhost:8787";
const UPLOAD_DIR = "public/uploads";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  zodInputShape: z.ZodRawShape;
  zodOutputShape: z.ZodRawShape;
  inputSchema: object;
  outputSchema: object;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

async function transcribeUrl(url: string): Promise<{ start: number; text: string }[]> {
  if (!OPENROUTER_API_KEY) throw new Error("Server has no OPENROUTER_API_KEY configured.");
  const audioRes = await fetch(url);
  if (!audioRes.ok) throw new Error(`Could not fetch audio at ${url}: HTTP ${audioRes.status}`);
  const contentType = audioRes.headers.get("content-type") ?? "";
  if (!contentType.startsWith("audio/") && !contentType.startsWith("video/") && contentType !== "application/octet-stream") {
    throw new Error(`The URL ${url} did not return audio (got content-type '${contentType}').`);
  }
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
  if (!res.ok) throw new Error(`Transcription of ${url} failed: HTTP ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { segments?: { start: number; text: string }[] };
  return (data.segments ?? []).map((s) => ({ start: s.start, text: s.text.trim() }));
}

export const toolDefs: ToolDef[] = [
  {
    name: "memo_write",
    title: "Write memo",
    description: "Saves a note.",
    zodInputShape: { text: z.string().describe("The note's text.") },
    zodOutputShape: { id: z.string() },
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "The note's text." } },
      required: ["text"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async ({ text }) => {
      const memo = await memos.write(String(text));
      return {
        content: [{ type: "text", text: `Saved memo ${memo.id}` }],
        structuredContent: { id: memo.id },
      };
    },
  },
  {
    name: "memo_search",
    title: "Search memos",
    description: "Finds notes whose text contains the query (case-insensitive). Empty query returns all notes.",
    zodInputShape: { query: z.string() },
    zodOutputShape: {
      notes: z.array(z.object({ id: z.string(), text: z.string(), createdAt: z.string() })),
    },
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        notes: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, text: { type: "string" }, createdAt: { type: "string" } },
            required: ["id", "text", "createdAt"],
            additionalProperties: false,
          },
        },
      },
      required: ["notes"],
      additionalProperties: false,
    },
    handler: async ({ query }) => {
      const notes = await memos.search(String(query));
      return {
        content: [{ type: "text", text: `Found ${notes.length} note(s).` }],
        structuredContent: { notes },
      };
    },
  },
  {
    name: "upload",
    title: "Upload file",
    description: "Puts a file on this server and gives back a link anyone can open.",
    zodInputShape: {
      filename: z.string().describe("Original filename, used only for its extension."),
      contentBase64: z.string().describe("File bytes, base64-encoded."),
    },
    zodOutputShape: { url: z.string() },
    inputSchema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Original filename, used only for its extension." },
        contentBase64: { type: "string", description: "File bytes, base64-encoded." },
      },
      required: ["filename", "contentBase64"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
      additionalProperties: false,
    },
    handler: async ({ filename, contentBase64 }) => {
      mkdirSync(UPLOAD_DIR, { recursive: true });
      const ext = extname(String(filename)).slice(0, 10);
      const name = `${randomUUID()}${ext}`;
      writeFileSync(`${UPLOAD_DIR}/${name}`, Buffer.from(String(contentBase64), "base64"));
      const url = `${PUBLIC_URL}/uploads/${name}`;
      return {
        content: [{ type: "text", text: url }],
        structuredContent: { url },
      };
    },
  },
  {
    name: "transcribe",
    title: "Transcribe audio",
    description: "Turns audio at a URL into timestamped text.",
    zodInputShape: { url: z.string().url() },
    zodOutputShape: {
      segments: z.array(z.object({ start: z.number(), text: z.string() })),
    },
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", format: "uri" } },
      required: ["url"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        segments: {
          type: "array",
          items: {
            type: "object",
            properties: { start: { type: "number" }, text: { type: "string" } },
            required: ["start", "text"],
            additionalProperties: false,
          },
        },
      },
      required: ["segments"],
      additionalProperties: false,
    },
    handler: async ({ url }) => {
      const segments = await transcribeUrl(String(url));
      return {
        content: [{ type: "text", text: `${segments.length} segment(s) transcribed.` }],
        structuredContent: { segments },
      };
    },
  },
];
