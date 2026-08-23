import Emergency from "../models/emergency.js";
import { recommendHospital } from "./hospitalService.js";
import { updateAmbulanceStatus } from "./ambulanceService.js";
import { getIO } from "./socketService.js";
import { EmergencyStatus } from "../constants/emergencyStatus.js";
import logger from "./logger.js";

const RETRY_INTERVAL_MS = Number(process.env.HOSPITAL_RETRY_INTERVAL_MS) || 15000;
const activeRetries = new Map();

export const startHospitalRetry = (ambulanceId, emergencyId) => {
  stopHospitalRetry(ambulanceId);

  const interval = setInterval(async () => {
    try {
      const emergency = await Emergency.findById(emergencyId);

      if (!emergency || emergency.status !== EmergencyStatus.AWAITING_HOSPITAL) {
        stopHospitalRetry(ambulanceId);
        return;
      }
      if (emergency.assigned_hospital) {
        stopHospitalRetry(ambulanceId);
        return;
      }

      const hospitalResult = await recommendHospital(emergency);
      if (!hospitalResult) {
        logger.info("Hospital retry: still none available", { ambulanceId, emergencyId });
        return;
      }
      const { hospital, score, routeSource } = hospitalResult;

      const updated = await Emergency.findByIdAndUpdate(
        emergencyId,
        { assigned_hospital: hospital._id, status: EmergencyStatus.TRANSPORTING },
        { new: true }
      );


      await updateAmbulanceStatus(ambulanceId, "transporting");

      logger.info("Hospital assigned after retry - beginning transport", {
        ambulanceId, emergencyId, hospitalId: hospital._id.toString(),
      });

      const io = getIO();
      if (io) {
        io.emit("hospital:assigned", { ambulanceId, emergencyId, hospitalId: hospital._id.toString() });
        io.emit("emergency:status-change", { emergencyId, status: updated.status });
      }

      stopHospitalRetry(ambulanceId);
    } catch (err) {
      logger.error("Hospital retry attempt failed", { ambulanceId, emergencyId, error: err.message });
    }
  }, RETRY_INTERVAL_MS);

  activeRetries.set(ambulanceId, interval);
};

export const stopHospitalRetry = (ambulanceId) => {
  const existing = activeRetries.get(ambulanceId);
  if (existing) {
    clearInterval(existing);
    activeRetries.delete(ambulanceId);
  }
};