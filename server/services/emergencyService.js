import mongoose from "mongoose";
import Emergency from "../models/emergency.js";
import Alert from "../models/alert.js";
import MedicalCrew from "../models/medicalCrew.js";
import { updateAmbulanceStatus } from "./ambulanceService.js";
import { completeTrip } from "./tripService.js";
import { getIO } from "./socketService.js";
import logger from "./logger.js";
import { cancelOnSceneTimer } from "./onSceneTimerService.js";
import { stopHospitalRetry } from "./hospitalRetryService.js";
import { releaseCrew } from "./crewService.js";

export const completeEmergency = async (ambulanceId, emergencyId) => {
  cancelOnSceneTimer(ambulanceId);
  stopHospitalRetry(ambulanceId);
  const session = await mongoose.startSession();
  let outcome = null;

  try {
    await session.withTransaction(async () => {
      const emergency = await Emergency.findById(emergencyId).session(session);

      if (!emergency) {
        logger.warn("completeEmergency called with unknown emergency", { emergencyId });
        return;
      }
      if (emergency.status === "resolved") {
        logger.warn("Emergency already resolved, skipping", { emergencyId });
        return;
      }

      emergency.status = "resolved";
      emergency.assigned_ambulance = null;
      await emergency.save({ session });

      const trip = await completeTrip(ambulanceId, session);

      const alertResult = await Alert.updateOne(
        { emergency: emergencyId, ambulance: ambulanceId },
        { solved: true },
        { session }
      );
      if (!alertResult.matchedCount) {
        logger.warn("No matching alert found to solve", { ambulanceId, emergencyId });
      }

      await updateAmbulanceStatus(ambulanceId, "available", {}, session);

      await releaseCrew(ambulanceId, session);

      outcome = { emergencyId, ambulanceId, tripClosed: !!trip };
    });
  } finally {
    await session.endSession();
  }

  if (!outcome) {
    return null;
  }

  const io = getIO();
  if (io) {
    io.emit("emergency:resolved", { emergencyId, ambulanceId });
    io.emit("trip:completed", { ambulanceId, emergencyId });
  }

  logger.info("Emergency completed", { ambulanceId, emergencyId });

  return outcome;
};