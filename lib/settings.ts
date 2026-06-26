// App settings store (server-only).
//
// Resolves the Gemini API key from the local DB (entered via the in-app
// Settings page) first, then falls back to the GEMINI_API_KEY env var. The key
// is read ONLY here and in the Gemini client; it is never returned to the
// browser. Importing this module pulls in Prisma, so it must stay server-side.

import { prisma } from "@/lib/db";
import { getGeminiApiKey as getEnvGeminiApiKey } from "@/lib/constants";

const SETTING_ID = "singleton";

/**
 * The effective Gemini API key: a key saved via the Settings page takes
 * precedence; otherwise the GEMINI_API_KEY env var. Returns undefined when
 * neither is set.
 */
export async function resolveGeminiApiKey(): Promise<string | undefined> {
  const row = await prisma.appSetting.findUnique({ where: { id: SETTING_ID } });
  const stored = row?.geminiApiKey?.trim();
  if (stored) return stored;
  return getEnvGeminiApiKey();
}

/** Save (or clear, with null) the Gemini API key in the local DB. */
export async function setGeminiApiKey(key: string | null): Promise<void> {
  const value = key?.trim() ? key.trim() : null;
  await prisma.appSetting.upsert({
    where: { id: SETTING_ID },
    update: { geminiApiKey: value },
    create: { id: SETTING_ID, geminiApiKey: value },
  });
}

export interface GeminiKeyStatus {
  configured: boolean;
  /** Where the active key comes from. */
  source: "manual" | "env" | "none";
  /** A masked hint (last 4 chars), never the full key. Null when unset. */
  masked: string | null;
}

/**
 * Report whether a key is configured and where it comes from, WITHOUT exposing
 * the key. Safe to surface in the (server-rendered) Settings page.
 */
export async function getGeminiKeyStatus(): Promise<GeminiKeyStatus> {
  const row = await prisma.appSetting.findUnique({ where: { id: SETTING_ID } });
  const stored = row?.geminiApiKey?.trim();
  if (stored) return { configured: true, source: "manual", masked: maskKey(stored) };

  const env = getEnvGeminiApiKey();
  if (env) return { configured: true, source: "env", masked: maskKey(env) };

  return { configured: false, source: "none", masked: null };
}

function maskKey(key: string): string {
  const last4 = key.slice(-4);
  return `••••••••${last4}`;
}
