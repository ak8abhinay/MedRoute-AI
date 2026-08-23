import Alert from "../models/alert.js";
import logger from "./logger.js";

/**
 * Creates a dispatch Alert record.
 * session is optional so this still works
 * outside a MongoDB transaction.
 */
export const createDispatchAlert = async (
  emergency,
  ambulance,
  session = null
) => {
  try {
    const alert = await Alert.create(
      [
        {
          emergency: emergency._id,
          ambulance: ambulance._id,
          priority: emergency.severity,
          solved: false,
          timestamp: new Date(),
        },
      ],
      { session }
    );

    const created = alert[0];

    logger.info("Alert created", {
      alertId: created._id.toString(),
      emergencyId: emergency._id.toString(),
      ambulanceId: ambulance._id.toString(),
    });

    return created;
  } catch (err) {
    logger.error("Failed to create dispatch alert", {
      emergencyId: emergency._id.toString(),
      ambulanceId: ambulance._id.toString(),
      error: err.message,
    });

    throw err;
  }
};