import { recordPosition, getLatestPosition } from "../services/gpsService.js";

/**
 * POST /api/gps
 * Records a new GPS position for an ambulance.
 * all the actual logic (saving the point,
 * emitting it live, detecting arrival) present in the service, not here.
 */
export const addPosition = async (req, res) => {
  try {
    const { ambulanceId, latitude, longitude, speed } = req.body;

    if (!ambulanceId || latitude == null || longitude == null) {
      return res.status(400).json({
        error: "ambulanceId, latitude, and longitude are required.",
      });
    }

    const point = await recordPosition({ ambulanceId, latitude, longitude, speed });
    res.status(201).json(point);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

/**
 * GET /api/gps/latest/:ambulanceId
 * Returns the most recent recorded GPS position for one ambulance,
 * or 404 if it has never reported one.
 */
export const getLatest = async (req, res) => {
  try {
    const point = await getLatestPosition(req.params.ambulanceId);
    if (!point) {
      return res.status(404).json({ error: "No GPS data found for this ambulance." });
    }
    res.json(point);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};