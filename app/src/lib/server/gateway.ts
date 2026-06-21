// Shared Kiro gateway client (OpenAI-compatible chat completions).
//
// Extracted so committee.ts (legacy judge) and the v2 debate engine
// (advocates / jury / guardrail) share one fetch + env path with no
// cross-version SDK dependency. Pure fetch; no SDK import.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Read a key from env, falling back to ~/.hermes/.env (zero-dep). */
export function envVal(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    const raw = readFileSync(join(homedir(), ".hermes", ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      if (t.slice(0, eq).trim() === key) {
        let v = t.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }
    }
  } catch {
    /* no env file */
  }
  return undefined;
}

export function gatewayBaseUrl(): string {
  return envVal("KIRO_GATEWAY_BASE_URL") ?? "http://127.0.0.1:8000";
}

export function gatewayApiKey(): string {
  const k = envVal("KIRO_GATEWAY_API_KEY");
  if (!k) throw new Error("KIRO_GATEWAY_API_KEY not configured (env or ~/.hermes/.env)");
  return k;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

/**
 * One chat completion against the gateway. Returns the assistant text.
 * Throws on transport / non-2xx so callers can decide how to degrade.
 */
export async function chat(opts: ChatOptions): Promise<string> {
  const res = await fetch(`${gatewayBaseUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${gatewayApiKey()}` },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 400,
      temperature: opts.temperature ?? 0,
    }),
  });
  if (!res.ok) {
    throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const j: any = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
}

/** Extract the first JSON object from a model response (tolerant of prose). */
export function extractJson(raw: string): any | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
