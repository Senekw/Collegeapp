"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { getFastModel } from "@/lib/constants";
import { callStructured } from "@/lib/gemini/client";
import { zodToGeminiSchema } from "@/lib/gemini/schemas";
import {
  getGeminiKeyStatus,
  setGeminiApiKey,
  type GeminiKeyStatus,
} from "@/lib/settings";
import type { ActionResult } from "@/lib/types";

/** Save the Gemini API key (server-side only; never echoed back to the client). */
export async function saveGeminiKeyAction(key: string): Promise<ActionResult<GeminiKeyStatus>> {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, error: "Paste a key first." };
  try {
    await setGeminiApiKey(trimmed);
    revalidatePath("/settings");
    return { ok: true, data: await getGeminiKeyStatus() };
  } catch {
    return { ok: false, error: "Could not save the key. Try again." };
  }
}

/** Remove the stored key (the env var, if any, becomes the active key again). */
export async function clearGeminiKeyAction(): Promise<ActionResult<GeminiKeyStatus>> {
  try {
    await setGeminiApiKey(null);
    revalidatePath("/settings");
    return { ok: true, data: await getGeminiKeyStatus() };
  } catch {
    return { ok: false, error: "Could not clear the key." };
  }
}

/** Make a tiny real Gemini call to confirm the active key actually works. */
export async function testGeminiKeyAction(): Promise<ActionResult<{ model: string }>> {
  const schema = z.object({ ok: z.boolean() });
  try {
    await callStructured({
      model: getFastModel(),
      systemPrompt: 'Reply with exactly this JSON: {"ok": true}',
      userPayload: { ping: true },
      schema,
      responseSchema: zodToGeminiSchema(schema),
    });
    return { ok: true, data: { model: getFastModel() } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes("not configured")) {
      return { ok: false, error: "No key is set yet." };
    }
    return { ok: false, error: `The key didn't work: ${msg}` };
  }
}
