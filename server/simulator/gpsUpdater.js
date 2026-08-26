import { BACKEND_URL } from "./config.js";

/**
 * The ONLY way this simulator ever touches backend state - a plain POST
 * to the existing, already-tested /api/gps endpoint. This file has no
 * knowledge of arrival detection, emergency resolution, or any other
 * business logic. It reports a position; the backend decides what that
 * means.
 */
export const postGpsUpdate = async (ambulanceId, latitude, longitude, speed) => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/gps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ambulanceId, latitude, longitude, speed }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(`[gps] POST failed for ${ambulanceId}: ${res.status} ${body.error || ""}`);
    }
  } catch (err) {
    console.error(`[gps] POST error for ${ambulanceId}:`, err.message);
  }
};