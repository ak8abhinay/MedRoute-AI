import GPS from "../models/gps.js";
import Ambulance from "../models/ambulance.js";
import Emergency from "../models/emergency.js";
import { getIO } from "./socketService.js";
import { updateAmbulanceStatus } from "./ambulanceService.js";
import { completeEmergency } from "./emergencyService.js";
import { calculateDistance } from "../utils/geoUtils.js";
import logger from "./logger.js";
import { startOnSceneTimer } from "./onSceneTimerService.js";
import { EmergencyStatus } from "../constants/emergencyStatus.js";

// How close (in meters) an ambulance must be to a target location -
// either the emergency scene or the assigned hospital - before it's
// considered "arrived". Configurable via env so this can be tuned per
// environment (e.g. looser for noisy GPS in testing) without a code change.
const ARRIVAL_THRESHOLD_METERS = Number(process.env.ARRIVAL_THRESHOLD_METERS) || 50;

/**
 * Records a single incoming GPS position for an ambulance, broadcasts it
 * live to connected clients, then checks whether this position means the
 * ambulance has arrived somewhere meaningful - either the emergency scene
 * or, later in the case, the hospital it's transporting a patient to.
 *
 * Sequence (unchanged): save GPS -> emit Socket.IO update -> detect arrival.
 *
 * @param {Object} params
 * @param {string} params.ambulanceId
 * @param {number} params.latitude
 * @param {number} params.longitude
 * @param {number} [params.speed=0]
 * @returns {Promise<Object>} the created GPS document
 * @throws rethrows any error after logging, so the caller (e.g. the GPS
 *   controller/route handler) can decide the HTTP response.
 */
export const recordPosition = async ({ ambulanceId, latitude, longitude, speed = 0 }) => {
  try {
    const point = await GPS.create({
      ambulance: ambulanceId,
      latitude,
      longitude,
      speed,
      timestamp: new Date(),
    });

    // Cache the latest position directly on the ambulance so dispatch
    // scoring can read it in the same query as everything else, without
    // a GPS lookup per candidate. GPS collection stays the source of
    // truth/history; this is a denormalized copy for read speed only.
    const ambulance = await Ambulance.findByIdAndUpdate(
      ambulanceId,
      { latitude, longitude },
      { new: true }
    );

    if (!ambulance) {
      throw new Error("Ambulance not found.");
    }

    const io = getIO();
    if (io) {
      io.emit("ambulance:gps-update", {
        ambulanceId,
        latitude,
        longitude,
        speed,
        timestamp: point.timestamp,
      });
    }

    await processArrival(ambulanceId, latitude, longitude);

    return point;
  } catch (err) {
    logger.error("Failed to record GPS position", {
      ambulanceId,
      latitude,
      longitude,
      error: err.message,
    });
    throw err;
  }
};

/**
 * Routes an incoming position to the correct arrival check based on the
 * ambulance's current physical/operational status:
 *   "onRoute"      -> heading to the emergency scene
 *   "transporting" -> heading to the assigned hospital
 * Any other status - arrival detection isn't relevant right now.
 *
 * @param {string} ambulanceId
 * @param {number} latitude
 * @param {number} longitude
 */
const processArrival = async (ambulanceId, latitude, longitude) => {
  const ambulance = await Ambulance.findById(ambulanceId);
  if (!ambulance) return;

  if (ambulance.status === "onRoute") {
    await checkArrivalAtEmergency(ambulance, latitude, longitude);
  } else if (ambulance.status === "transporting") {
    await checkArrivalAtHospital(ambulance, latitude, longitude);
  }
};

/**
 * First arrival leg: ambulance reaching the emergency scene. On arrival,
 * flips the ambulance to "working" and the emergency to "atScene", then
 * starts the on-scene timer - which, once it fires, decides whether
 * transport can begin immediately or has to wait for a hospital
 * (see onSceneTimerService / hospitalRetryService). This function does
 * NOT resolve the emergency itself anymore - that now only happens after
 * the second arrival leg, at the hospital.
 *
 * Silently no-ops if there's no matching emergency yet or the ambulance
 * isn't close enough - neither is an error, just "not arrived yet".
 */
const checkArrivalAtEmergency = async (ambulance, latitude, longitude) => {
  const emergency = await Emergency.findOne({
    assigned_ambulance: ambulance._id,
    status: EmergencyStatus.ASSIGNED,
  }).sort({ createdAt: -1 });
  if (!emergency || emergency.latitude == null || emergency.longitude == null) return;

  const distanceMeters = calculateDistance(latitude, longitude, emergency.latitude, emergency.longitude);
  if (distanceMeters > ARRIVAL_THRESHOLD_METERS) return;

  try {
    // Required first step - the state machine has no direct
    // onRoute -> transporting edge. Goes through ambulanceService so the
    // transition is validated, logged, and broadcast like every other
    // status change.
    await updateAmbulanceStatus(ambulance._id.toString(), "working");

    emergency.status = EmergencyStatus.AT_SCENE;
    await emergency.save();

    logger.info("Ambulance arrived at emergency location", {
      ambulanceId: ambulance._id.toString(),
      emergencyId: emergency._id.toString(),
      distance: distanceMeters.toFixed(2),
    });

    // Hands off to onSceneTimerService - it decides, once the timer
    // fires, whether to go straight to "transporting" (hospital already
    // assigned) or "awaitingHospital" (retry loop takes over).
    startOnSceneTimer(ambulance._id.toString(), emergency._id.toString());
  } catch (err) {
    logger.warn("Failed to process arrival at emergency", {
      ambulanceId: ambulance._id.toString(),
      emergencyId: emergency._id.toString(),
      error: err.message,
    });
  }
};

/**
 * Second arrival leg: ambulance reaching the assigned hospital, after
 * treatment and hospital assignment are both already done. This is now
 * the only place completeEmergency gets called - resolving the case,
 * closing the trip, freeing the ambulance and crew.
 *
 * Silently no-ops if there's no matching "transporting" emergency, or no
 * hospital assigned to check proximity against (shouldn't happen by the
 * time status reaches "transporting", but guarded rather than assumed).
 */
const checkArrivalAtHospital = async (ambulance, latitude, longitude) => {
  const emergency = await Emergency.findOne({
    assigned_ambulance: ambulance._id,
    status: EmergencyStatus.TRANSPORTING,
  }).populate("assigned_hospital");

  if (!emergency || !emergency.assigned_hospital) return;

  const hospital = emergency.assigned_hospital;
  const distanceMeters = calculateDistance(latitude, longitude, hospital.latitude, hospital.longitude);
  if (distanceMeters > ARRIVAL_THRESHOLD_METERS) return;

  logger.info("Ambulance arrived at hospital", {
    ambulanceId: ambulance._id.toString(),
    emergencyId: emergency._id.toString(),
    hospitalId: hospital._id.toString(),
    distance: distanceMeters.toFixed(2),
  });

  // This is now the only trigger for closing out the case.
  await completeEmergency(ambulance._id.toString(), emergency._id.toString());
};

/**
 * Returns the most recent recorded GPS position for an ambulance, or
 * null if it has never reported one.
 *
 * @param {string} ambulanceId
 * @returns {Promise<Object|null>}
 */
export const getLatestPosition = async (ambulanceId) => {
  return GPS.findOne({ ambulance: ambulanceId }).sort({ timestamp: -1 }).lean();
};