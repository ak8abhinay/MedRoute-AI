import { dispatchEmergency } from "../services/dispatchService.js";

/**
 * POST /api/dispatch/:emergencyId
 * Thin HTTP adapter - all logic (scoring, assignment, Trip creation,
 * Alert creation) lives in dispatchService.
 */
export const dispatch = async (req, res) => {
  try {
    const result = await dispatchEmergency(req.params.emergencyId);
    res.status(200).json(result);
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message });
  }
};