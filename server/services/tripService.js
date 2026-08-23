import Trip from "../models/trip.js";
import logger from "./logger.js";

/**
 * Creates the Trip record for a dispatch. hospital and crew may both be
 * null - dispatch is never blocked on either being available. session
 * is optional so this still works standalone outside a transaction.
 */
export const createTrip = async (ambulance, emergency, hospital, session = null) => {
  const trip = await Trip.create(
    [
      {
        ambulance: ambulance._id,
        emergency: emergency._id,
        hospital: hospital ? hospital._id : null,
        crew: ambulance.assigned_crew || null,
        start_time: new Date(),
        status: "ongoing",
      },
    ],
    { session }
  );

  const created = trip[0]; // array form required for session to apply

  logger.info("Trip created", {
    tripId: created._id.toString(),
    ambulanceId: ambulance._id.toString(),
    emergencyId: emergency._id.toString(),
    hospitalId: hospital ? hospital._id.toString() : null,
  });

  return created;
};

/**
 * Marks the ongoing trip for an ambulance as completed. Called from
 * emergencyService.completeEmergency() as part of the atomic resolution
 * transaction - accepts an optional session so it can participate in
 * that transaction rather than committing independently.
 */

export const completeTrip = async (ambulanceId, session = null) => {
  const trip = await Trip.findOne({ ambulance: ambulanceId, status: "ongoing" }).session(session);

  if (!trip) {
    logger.warn("No ongoing trip found to complete", { ambulanceId });
    return null;
  }

  trip.status = "completed";
  trip.end_time = new Date();
  await trip.save({ session });

  logger.info("Trip completed", { tripId: trip._id.toString(), ambulanceId });

  return trip;
};
