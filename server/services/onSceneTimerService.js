import { updateAmbulanceStatus } from "./ambulanceService.js";
import { startHospitalRetry } from "./hospitalRetryService.js";
import { getIO } from "./socketService.js";
import Emergency from "../models/emergency.js";
import { EmergencyStatus } from "../constants/emergencyStatus.js";
import logger from "./logger.js";

const ON_SCENE_TIME_MS = Number(process.env.ON_SCENE_TIME_MS) || 20000;
const activeTimers = new Map();

export const startOnSceneTimer = (ambulanceId, emergencyId) => {
  cancelOnSceneTimer(ambulanceId);

  const timeout = setTimeout(async () => {
    activeTimers.delete(ambulanceId);
    try {
      const emergency = await Emergency.findById(emergencyId);
      if (!emergency) {
        logger.warn("On-scene timer fired for unknown emergency", { ambulanceId, emergencyId });
        return;
      }

      if (emergency.status !== EmergencyStatus.AT_SCENE) {
        logger.info("Ignoring stale on-scene timer - emergency status has moved on", {
          ambulanceId, emergencyId, currentStatus: emergency.status,
        });
        return;
      }

      const io = getIO();

      if (emergency.assigned_hospital) {
        const updated = await Emergency.findByIdAndUpdate(
          emergencyId, { status: EmergencyStatus.TRANSPORTING }, { new: true }
        );
        await updateAmbulanceStatus(ambulanceId, "transporting");

        logger.info("On-scene time complete - hospital already assigned, beginning transport", { ambulanceId, emergencyId });
        if (io) io.emit("emergency:status-change", { emergencyId, status: updated.status });
      } else {
        const updated = await Emergency.findByIdAndUpdate(
          emergencyId, { status: EmergencyStatus.AWAITING_HOSPITAL }, { new: true }
        );

        logger.info("On-scene time complete - no hospital assigned, awaiting allocation", { ambulanceId, emergencyId });
        if (io) io.emit("emergency:status-change", { emergencyId, status: updated.status });

        startHospitalRetry(ambulanceId, emergencyId);
      }
    } catch (err) {
      logger.warn("Failed to transition after on-scene time", { ambulanceId, error: err.message });
    }
  }, ON_SCENE_TIME_MS);

  activeTimers.set(ambulanceId, timeout);
};

export const cancelOnSceneTimer = (ambulanceId) => {
  const existing = activeTimers.get(ambulanceId);
  if (existing) {
    clearTimeout(existing);
    activeTimers.delete(ambulanceId);
  }
};