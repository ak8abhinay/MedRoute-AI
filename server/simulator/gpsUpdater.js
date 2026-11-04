import { BACKEND_URL } from "./config.js";
import { authedFetch } from "./http.js";

/**
 * The ONLY way this simulator ever changes backend state - a plain POST
 * to /api/gps, authenticated with the service key. No knowledge of
 * arrival detection, resolution, or any other business logic.
 */
export const postGpsUpdate = async (ambulanceId, latitude, longitude, speed) => {
  try {
    const res = await authedFetch(`${BACKEND_URL}/api/gps`, {
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