// Shared LLM gateway client (OpenAI-compatible chat completions).
//
// Two providers, transparent to callers (committee, debate, jury, guardrail):
//
//   1. **OpenRouter** — used in production / Vercel deploys. Selected
//      automatically when OPENROUTER_API_KEY is present.
//   2. **Kiro local gateway** — used for local dev. Selected when no
//      OPENROUTER_API_KEY is set; reads KIRO_GATEWAY_BASE_URL +
//      KIRO_GATEWAY_API_KEY (default base http://127.0.0.1:8000).
//
// Pure fetch, no SDK dependency. Both endpoints are OpenAI-compatible at
// /v1/chat/completions and /api/v1/chat/completions respectively.

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

export type GatewayProvider = "openrouter" | "kiro";

/** Active provider. Explicit TRIBUNAL_GATEWAY_PROVIDER wins (used by tests
 *  to pin the provider regardless of ambient env / ~/.hermes/.env);
 *  otherwise OpenRouter wins when its key is set. */
export function gatewayProvider(): GatewayProvider {
  const forced = envVal("TRIBUNAL_GATEWAY_PROVIDER");
  if (forced === "openrouter" || forced === "kiro") return forced;
  return envVal("OPENROUTER_API_KEY") ? "openrouter" : "kiro";
}

/** Base URL for the active provider. */
export function gatewayBaseUrl(): string {
  if (gatewayProvider() === "openrouter") {
    return envVal("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1";
  }
  return envVal("KIRO_GATEWAY_BASE_URL") ?? "http://127.0.0.1:8000";
}

/** Auth header value for the active provider. Throws when unconfigured. */
function authHeader(): string {
  if (gatewayProvider() === "openrouter") {
    const k = envVal("OPENROUTER_API_KEY");
    if (!k) throw new Error("OPENROUTER_API_KEY not configured (env or ~/.hermes/.env)");
    return `Bearer ${k}`;
  }
  const k = envVal("KIRO_GATEWAY_API_KEY");
  if (!k) throw new Error("KIRO_GATEWAY_API_KEY not configured (env or ~/.hermes/.env)");
  return `Bearer ${k}`;
}

/** Back-compat: kept so older call sites still type-check. */
export function gatewayApiKey(): string {
  return authHeader().replace(/^Bearer\s+/, "");
}

/** Chat completions URL — Kiro uses /v1, OpenRouter uses /api/v1 (which the
 *  default base already encodes), so we always suffix /chat/completions. */
function completionsUrl(): string {
  const base = gatewayBaseUrl().replace(/\/+$/, "");
  if (gatewayProvider() === "openrouter") return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
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
 * One chat completion against the active provider. Returns the assistant text.
 * Throws on transport / non-2xx so callers can decide how to degrade.
 *
 * Reasoning-model quirk: OpenRouter routes reasoning content into
 * `message.reasoning` and leaves `message.content` null by default (GLM-5.2,
 * o1, etc.). The guardrail / jury / advocate prompts all expect JSON in
 * `content`, so we send `reasoning: { enabled: false }` on OpenRouter to
 * force the answer back into `content`. As belt-and-braces we also fall back
 * to `message.reasoning` if `content` came through empty.
 */
export async function chat(opts: ChatOptions): Promise<string> {
  const provider = gatewayProvider();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: authHeader(),
  };
  // OpenRouter attribution headers — optional but useful for their leaderboards
  // and abuse triage. No-ops on Kiro since the gateway ignores unknown headers.
  if (provider === "openrouter") {
    const referer = envVal("OPENROUTER_HTTP_REFERER");
    const title = envVal("OPENROUTER_X_TITLE");
    if (referer) headers["HTTP-Referer"] = referer;
    if (title) headers["X-Title"] = title;
  }

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 400,
    temperature: opts.temperature ?? 0,
  };
  // Force reasoning models to surface answers in `content`, not `reasoning`.
  if (provider === "openrouter") body.reasoning = { enabled: false };

  const res = await fetch(completionsUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const j: any = await res.json();
  const msg = j.choices?.[0]?.message ?? {};
  return msg.content ?? msg.reasoning ?? "";
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
