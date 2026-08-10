import Ambulance from "../models/ambulance.js";
import { getIO } from "./socketService.js";
import logger from "./logger.js";

export const allowedTransitions = {
  idle: ["available"],
  available: ["dispatched"],
  dispatched: ["onRoute"],
  onRoute: ["working"],
  working: ["transporting"],
  transporting: ["available"],
};

export const isValidTransition = (currentStatus, nextStatus) => {
  if (currentStatus === nextStatus) return true;
  return allowedTransitions[currentStatus]?.includes(nextStatus) ?? false;
};

// Single source of truth for changing an ambulance's status - validated,
// logged, and broadcast in exactly one place. ambulanceController calls
// this for HTTP-driven updates; gpsService (on arrival detection) and
// dispatchController (on dispatch) call it directly, no HTTP needed.
export const updateAmbulanceStatus = async (ambulanceId, newStatus, extraFields = {}, session = null) => {
  const ambulance = session
    ? await Ambulance.findById(ambulanceId).session(session)
    : await Ambulance.findById(ambulanceId);
  if (!ambulance) {
    const err = new Error("Ambulance not found");
    err.statusCode = 404;
    throw err;
  }

  if (!isValidTransition(ambulance.status, newStatus)) {
    logger.warn("Blocked invalid ambulance status transition", {
      ambulanceId,
      from: ambulance.status,
      to: newStatus,
    });
    const err = new Error(
      `Cannot change ambulance status from "${ambulance.status}" to "${newStatus}".`
    );
    err.statusCode = 400;
    throw err;
  }

  const updated = await Ambulance.findByIdAndUpdate(
    ambulanceId,
    { status: newStatus, ...extraFields },
    {
      new: true,
      session,
    }
  );

  logger.info("Ambulance status changed", {
    ambulanceId: updated._id.toString(),
    from: ambulance.status,
    to: newStatus,
  });

  const io = getIO();
  if (io) {
    io.emit("ambulance:status-change", {
      ambulanceId: updated._id.toString(),
      status: updated.status,
      updatedFields: { status: newStatus, ...extraFields },
    });
  }

  return updated;
};