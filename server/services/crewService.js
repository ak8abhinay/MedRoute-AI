import MedicalCrew from "../models/medicalCrew.js";
import Ambulance from "../models/ambulance.js";
import logger from "./logger.js";

/**
 * Assigns an available crew member to an ambulance, keeping both sides
 * of the relationship in sync. If the ambulance already has a crew
 * reference, verifies it's actually reciprocated on the crew's side
 * before trusting it - self-heals a stale/inconsistent reference rather
 * than propagating it. Returns null (not an error) if no crew is
 * available - dispatch is never blocked on this, same as hospital
 * recommendation.
 */
export const assignCrewToAmbulance = async (ambulanceId, session = null) => {
  const ambulance = await Ambulance.findById(ambulanceId).session(session);
  if (!ambulance) {
    const err = new Error("Ambulance not found");
    err.statusCode = 404;
    throw err;
  }

  if (ambulance.assigned_crew) {
    const existingCrew = await MedicalCrew.findById(ambulance.assigned_crew).session(session);
    if (existingCrew && existingCrew.assigned_ambulance?.toString() === ambulanceId) {
      logger.info("Ambulance already has a valid crew - skipping auto-assignment", {
        ambulanceId,
        crewId: existingCrew._id.toString(),
      });
      return existingCrew;
    }
    logger.warn("Ambulance.assigned_crew was stale/inconsistent - re-assigning", { ambulanceId });
  }

  const crew = await MedicalCrew.findOne({ assigned_ambulance: null }).session(session);
  if (!crew) {
    logger.warn("No available crew to assign for dispatch", { ambulanceId });
    return null;
  }

  crew.assigned_ambulance = ambulanceId;
  await crew.save({ session });

  ambulance.assigned_crew = crew._id;
  await ambulance.save({ session });

  logger.info("Crew auto-assigned for dispatch", { ambulanceId, crewId: crew._id.toString() });
  return crew;
};

/**
 * Releases the crew currently assigned to an ambulance, clearing both
 * sides of the relationship together. Safe to call even if no crew is
 * assigned - just logs and does nothing in that case.
 */
export const releaseCrew = async (ambulanceId, session = null) => {
  const result = await MedicalCrew.updateOne(
    { assigned_ambulance: ambulanceId },
    { assigned_ambulance: null },
    { session }
  );
  await Ambulance.updateOne({ _id: ambulanceId }, { assigned_crew: null }, { session });

  if (!result.matchedCount) {
    logger.info("No crew assigned to this ambulance, nothing to release", { ambulanceId });
  } else {
    logger.info("Crew released - both sides cleared", { ambulanceId });
  }
};