import Alert from "../models/alert.js";
import { getIO } from "../services/socketService.js";

export const sendDispatchAlert = async (emergency, ambulance) => {
  try {
    const alert = await Alert.create({
      emergency: emergency._id,
      ambulance: ambulance._id,
      priority: emergency.severity,
      solved: false,
      timestamp: new Date(),
    });

    console.log(`✅ Alert created (id: ${alert._id}) for ${ambulance.vehicle_number}`);

    const io = getIO();
    if (io) {
      io.emit("alert:created", {
        alertId: alert._id.toString(),
        emergencyId: emergency._id.toString(),
        ambulanceId: ambulance._id.toString(),
        priority: alert.priority,
      });
    }

    return alert;
  } catch (err) {
    console.error("❌ Failed to create dispatch alert:", err.message);
    throw err;
  }
};