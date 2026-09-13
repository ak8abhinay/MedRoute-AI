import axios from "axios";
import logger from "./logger.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8000";
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS) || 3000;

const isValidNumber = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * Scores a batch of candidates via the FastAPI ML service in ONE call.
 * Returns null on ANY failure - network error, timeout, malformed
 * response, or a response that's shaped correctly but contains invalid
 * values (NaN, an out-of-range index, etc). Never throws. No separate
 * health check - a failed predict() call IS the failure signal, same
 * pattern as routingService.getRoute()'s try/catch/fallback, not a
 * pre-flight check followed by the real call.
 *
 * @param {Array<{duration_seconds: number, has_known_position: boolean}>} candidates
 * @returns {Promise<{bestIndex: number, scores: number[]}|null>}
 */
export const predictScores = async (candidates) => {
  if (!candidates || candidates.length === 0) return null;

  try {
    const payload = {
      candidates: candidates.map((c) => ({
        duration_seconds: c.duration_seconds,
        has_known_position: c.has_known_position,
      })),
    };

    const res = await axios.post(`${ML_SERVICE_URL}/api/predict/ambulance`, payload, { timeout: ML_TIMEOUT_MS });
    const { best_index, scores } = res.data;

    if (!Number.isInteger(best_index)) {
      throw new Error(`best_index is not an integer: ${JSON.stringify(best_index)}`);
    }
    if (!Array.isArray(scores) || scores.length !== candidates.length) {
      throw new Error(`scores array missing or wrong length (expected ${candidates.length})`);
    }
    if (best_index < 0 || best_index >= scores.length) {
      throw new Error(`best_index ${best_index} out of range for ${scores.length} scores`);
    }
    if (!scores.every(isValidNumber)) {
      throw new Error("scores array contains a non-finite or non-numeric value");
    }

    return { bestIndex: best_index, scores };
  } catch (err) {
    logger.warn("ML prediction failed, falling back to rule-based scoring", { error: err.message });
    return null;
  }
};