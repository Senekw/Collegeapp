/**
 * Spike rarity calibration (§7.3) — the single LLM call in the spike slice.
 *
 * Places the deterministic spike profile on the 0..100 tier scale by comparing
 * it to anonymized admit archetypes. The model GATES the tier (archetype-
 * anchored); the deterministic band stays a floor/ceiling guide passed in as
 * `computedTier`.
 *
 * This module is transport-only: it builds the payload and delegates to
 * callStructured. It does NOT touch the DB. The server layer (assess.ts) builds
 * the SpikeCalibrationPayload from the core result + archetypes and persists.
 */

import { callStructured } from "@/lib/gemini/client";
import { getDeepModel } from "@/lib/constants";
import { SPIKE_CALIBRATION_SYSTEM_PROMPT } from "@/lib/gemini/prompts";
import {
  SpikeCalibrationSchema,
  SPIKE_CALIBRATION_RESPONSE_SCHEMA,
  type SpikeCalibrationPayload,
  type SpikeCalibrationResult,
} from "@/lib/gemini/schemas";

export async function calibrateSpike(
  payload: SpikeCalibrationPayload,
): Promise<SpikeCalibrationResult> {
  return callStructured<SpikeCalibrationResult>({
    model: getDeepModel(),
    systemPrompt: SPIKE_CALIBRATION_SYSTEM_PROMPT,
    userPayload: payload,
    schema: SpikeCalibrationSchema,
    responseSchema: SPIKE_CALIBRATION_RESPONSE_SCHEMA,
  });
}
