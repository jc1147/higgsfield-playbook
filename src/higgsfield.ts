import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { parseEnv } from "node:util";
import { config } from "@higgsfield/client/v2";

const API_BASE = "https://api.higgsfield.ai";
const ENV_FILE = join(import.meta.dirname, "..", ".env.local");

type Json = Record<string, unknown>;

const asJson = (value: unknown): Json =>
  typeof value === "object" && value !== null ? (value as Json) : {};

let credentials = "";

/**
 * Configures the SDK with HF_CREDENTIALS (key-id:key-secret) from the shell
 * environment or .env.local. The value is never printed.
 */
export function loadCredentials(): void {
  if (!process.env.HF_CREDENTIALS) {
    let raw: Buffer;
    try {
      raw = readFileSync(ENV_FILE);
    } catch {
      throw new Error(
        `HF_CREDENTIALS is not set and ${ENV_FILE} was not found. Copy .env.example to .env.local and add your key.`,
      );
    }
    // Tolerate files saved by Windows editors / PowerShell (UTF-16 LE or UTF-8 with BOM).
    const text = raw[0] === 0xff && raw[1] === 0xfe ? raw.toString("utf16le") : raw.toString("utf8");
    const parsed = parseEnv(text.replace(/^﻿/, "")) as Record<string, string | undefined>;
    if (parsed.HF_CREDENTIALS) process.env.HF_CREDENTIALS = parsed.HF_CREDENTIALS;
  }
  const value = process.env.HF_CREDENTIALS?.trim() ?? "";
  if (!/^[^\s:]+:[^\s:]+$/.test(value)) {
    throw new Error("HF_CREDENTIALS is missing or not in key-id:key-secret format (see .env.example).");
  }
  credentials = value;
  config({ credentials });
}

/**
 * Returns the output URLs of a terminal subscribe() result. Throws unless the
 * request completed with the expected output, so failed, moderated (nsfw) and
 * canceled requests are never reported as success.
 */
export function outputUrls(result: unknown, kind: "video" | "images"): { requestId: string; urls: string[] } {
  const r = asJson(result);
  const requestId = String(r.request_id ?? "unknown");
  switch (r.status) {
    case "completed": {
      const outputs = kind === "video" ? [r.video] : Array.isArray(r.images) ? r.images : [];
      const urls = outputs
        .map((output) => asJson(output).url)
        .filter((url): url is string => typeof url === "string" && url.length > 0);
      if (urls.length === 0) {
        throw new Error(`Request ${requestId} completed but returned no ${kind === "video" ? "video" : "image"} URL.`);
      }
      return { requestId, urls };
    }
    case "failed":
      throw new Error(`Request ${requestId} failed: ${String(r.error ?? "no error message")} (failed requests are not charged).`);
    case "nsfw":
      throw new Error(`Request ${requestId} was rejected by content moderation (nsfw). Moderated requests are not charged.`);
    case "canceled":
      throw new Error(`Request ${requestId} was canceled.`);
    default:
      throw new Error(`Request ${requestId} ended in unexpected status "${String(r.status)}".`);
  }
}

/**
 * Reports an error and sets a failing exit code. Never prints the raw error
 * object (HTTP client errors can carry request headers) and scrubs the
 * credential from everything it does print.
 */
export function exitWithError(error: unknown): void {
  const e = asJson(error);
  const response = asJson(e.response);
  const status = response.status ?? e.status ?? e.statusCode;
  const detail = asJson(response.data).detail ?? e.detail;
  let text = error instanceof Error ? error.message : String(error);
  if (status !== undefined) text += ` (status: ${String(status)})`;
  if (detail !== undefined) text += `\n  detail: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
  console.error(`FAILED: ${scrub(text)}`);
  process.exitCode = 1;
}

function scrub(text: string): string {
  const secret = credentials || process.env.HF_CREDENTIALS?.trim() || "";
  return [secret, ...secret.split(":")]
    .filter((part) => part.length >= 8)
    .reduce((t, part) => t.split(part).join("[redacted]"), text);
}

async function api(path: string, init: { method?: string; body?: unknown } = {}): Promise<Json> {
  if (!credentials) throw new Error("loadCredentials() must run before API calls.");
  const method = init.method ?? "GET";
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      Authorization: `Key ${credentials}`,
      ...(init.body !== undefined && { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = asJson(await res.json().catch(() => ({})));
  if (!res.ok) {
    const detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    const correlationId = res.headers.get("x-correlation-id") ?? "n/a";
    throw new Error(`${method} ${path} -> HTTP ${res.status}: ${detail} (correlation id ${correlationId})`);
  }
  return body;
}

/** Free price quote for a request, using the same input as the generation. */
export async function estimate(model: string, input: Json): Promise<string> {
  const quote = await api(`/estimate/${model}`, { method: "POST", body: input });
  if (quote.credits !== undefined && quote.usd !== undefined) {
    return `${String(quote.credits)} credits (~$${String(quote.usd)})`;
  }
  // Token-metered models (e.g. Seedance) answer with their pricing formula instead of a number.
  if (typeof quote.pricing_description === "string") return `no fixed quote (metered). ${quote.pricing_description}`;
  throw new Error(`Unexpected estimate response for ${model}: ${JSON.stringify(quote)}`);
}

export type Preset = { id: string; name: string; group: string; aspectRatio: string; cover: string };

/** Visible Marketing Studio presets. The catalog is managed server-side and changes, so look IDs up here. */
export async function listPresets(): Promise<Preset[]> {
  const presets: Preset[] = [];
  let cursor: unknown = null;
  for (let page = 0; page < 100; page++) {
    const query = cursor ? `&cursor=${encodeURIComponent(String(cursor))}` : "";
    const body = await api(`/marketing-studio/image/presets?size=50${query}`);
    for (const item of Array.isArray(body.items) ? body.items : []) {
      const p = asJson(item);
      const metadata = asJson(p.metadata);
      presets.push({
        id: String(p.id),
        name: String(p.name ?? ""),
        group: String(metadata.group_name ?? ""),
        aspectRatio: String(metadata.aspect_ratio ?? ""),
        cover: String(asJson(p.cover_image).url ?? ""),
      });
    }
    cursor = body.cursor;
    if (!cursor) break;
  }
  return presets;
}

/** Saves an output URL as <dir>/<name>.<ext> (URLs expire after ~7 days) and returns the file path. */
export async function download(url: string, dir: string, name: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download of ${url} failed: HTTP ${res.status}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name + (extname(new URL(url).pathname) || ".bin"));
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

const IMAGE_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Public URL for an input image: http(s) URLs pass through, local files are uploaded via a presigned URL. */
export async function imageUrl(pathOrUrl: string): Promise<string> {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const contentType = IMAGE_TYPES[extname(pathOrUrl).toLowerCase()];
  if (!contentType) throw new Error(`Unsupported image type: ${pathOrUrl} (use jpg, png, webp or gif).`);
  const file = readFileSync(pathOrUrl);
  const upload = await api("/files/generate-upload-url", { method: "POST", body: { content_type: contentType } });
  // The presigned storage URL gets only the returned upload headers, never Higgsfield credentials.
  const res = await fetch(String(upload.upload_url), {
    method: "PUT",
    headers: asJson(upload.upload_headers) as Record<string, string>,
    body: file,
  });
  if (!res.ok) throw new Error(`Upload of ${pathOrUrl} failed: HTTP ${res.status}`);
  return String(upload.public_url);
}
