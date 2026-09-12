import mongoose from "mongoose";
import Ambulance from "../models/ambulance.js";
import Emergency from "../models/emergency.js";
import MedicalCrew from "../models/medicalCrew.js";
import { updateAmbulanceStatus } from "./ambulanceService.js";
import { assignCrewToAmbulance } from "./crewService.js";
import { createDispatchAlert } from "./alertService.js";
import { recommendHospital } from "./hospitalService.js";
import { createTrip } from "./tripService.js";
import { getRoute } from "./routingService.js";
import { getIO } from "./socketService.js";
import logger from "./logger.js";
import { calculateDistance } from "../utils/geoUtils.js";
import { mapWithConcurrencyLimit } from "../utils/concurrency.js";
import { predictScores } from "./mlService.js";

// How many of the closest (by straight-line distance) available
// ambulances get a real OSRM route lookup. Keeps "one OSRM call per
// ambulance" from becoming a problem as the fleet grows - only the
// realistic contenders get the expensive real-route treatment.
const ROUTE_CANDIDATE_COUNT = Number(process.env.DISPATCH_ROUTE_CANDIDATES) || 5;
const OSRM_SCORING_CONCURRENCY = Number(process.env.OSRM_SCORING_CONCURRENCY) || 3;

// TODO: Future ambulance scoring factors:
// + Ambulance type / equipment match (e.g. ALS/BLS capability) - the
//   more realistic version of "crew suitability"; considered scoring by
//   individual crew role instead and decided against it -
//   only one crew member exists in test data, so any role-matching logic
//   would be unverifiable. Revisit once there's real multi-crew data.
// + Traffic-aware ETA (needs a live traffic data source, not just OSRM)
// + ML prediction is now live for the top OSRM-routed candidates (see
//   selectAmbulance below) - V1 distillation only, per
//   docs/ambulance-scoring-spec.md. Straight-line fallback candidates
//   remain out of ML scope.

// Fetches real duration only - no scoring here. Deliberately separated
// from scoring so ML can be tried once, batched, after all top-candidate
// durations are known, rather than scored one-by-one as they arrive.
const fetchDuration = async (ambulance, emergency) => {
  const route = await getRoute(ambulance.latitude, ambulance.longitude, emergency.latitude, emergency.longitude);
  return { ambulance, duration_seconds: route.duration, has_known_position: true, routeSource: route.source };
};

// The frozen V1 formula (docs/ambulance-scoring-spec.md), extracted as
// its own function so it's both the ML fallback AND the only formula
// this path ever used before ML existed - same function, two callers.
const ruleScore = ({ duration_seconds, has_known_position }) => {
  const penalty = has_known_position ? Math.min(duration_seconds / 45, 40) : 20;
  return 100 - penalty;
};

// Straight-line approximation for candidates beyond the pre-filter -
// UNCHANGED, out of ML scope. Different formula, different units (raw
// meters, not duration) - never mixed with the ML/duration path.
const scoreByStraightLine = (ambulance, straightLineDistance) => ({
  ambulance,
  score: straightLineDistance === Infinity ? 100 - 20 : 100 - Math.min(straightLineDistance / 500, 40),
  scoreSource: "rule-straightline",
  routeSource: null,
  etaSeconds: null,
});

/**
 * Selects the best available ambulance. Pre-filters to the closest
 * ROUTE_CANDIDATE_COUNT by straight-line distance, fetches real OSRM
 * durations (concurrency-limited) for just those, then scores them in
 * ONE batched ML call - falling back to the exact same rule formula
 * this path used before ML existed if the ML service is unavailable for
 * any reason. Everyone else is scored by straight-line distance as a
 * cheap fallback, unrelated to ML entirely.
 *
 * Deliberately does NOT take a MongoDB session - this makes real network
 * calls (OSRM, and now the ML service), and holding a transaction open
 * across HTTP round-trips is worth avoiding. Runs entirely before
 * dispatchEmergency's transaction starts; the transaction re-validates
 * the chosen ambulance via updateAmbulanceStatus's transition guard, so
 * a same-instant collision fails with a clear error instead of
 * corrupting anything.
 */
const selectAmbulance = async (emergency) => {
  const candidates = await Ambulance.find({ status: "available" });
  if (candidates.length === 0) {
    const err = new Error("No available ambulances.");
    err.statusCode = 409;
    throw err;
  }

  // Crew-eligibility gate, applied BEFORE any scoring - a candidate must
  // either already have crew, or there must be at least one free crew
  // member system-wide to pair with it at dispatch time.
  const crewAvailable = await MedicalCrew.exists({ assigned_ambulance: null });
  const eligible = candidates.filter((a) => a.assigned_crew || crewAvailable);

  if (eligible.length === 0) {
    const err = new Error("No ambulance-crew combination available.");
    err.statusCode = 409;
    throw err;
  }

  const withStraightLine = eligible
    .map((ambulance) => ({
      ambulance,
      straightLineDistance:
        ambulance.latitude != null && ambulance.longitude != null
          ? calculateDistance(ambulance.latitude, ambulance.longitude, emergency.latitude, emergency.longitude)
          : Infinity,
    }))
    .sort((a, b) => a.straightLineDistance - b.straightLineDistance);

  const topCandidates = withStraightLine.slice(0, ROUTE_CANDIDATE_COUNT);
  const remainingCandidates = withStraightLine.slice(ROUTE_CANDIDATE_COUNT);

  // Real durations for the top candidates - unchanged OSRM pipeline,
  // no scoring decided yet.
  const topWithDuration = await mapWithConcurrencyLimit(
    topCandidates,
    OSRM_SCORING_CONCURRENCY,
    ({ ambulance, straightLineDistance }) =>
      straightLineDistance === Infinity
        ? { ambulance, duration_seconds: 0, has_known_position: false, routeSource: null }
        : fetchDuration(ambulance, emergency)
  );

  // ONE batched ML call, only on the routed candidates - the frozen V1
  // scope boundary. Falls back to the exact same rule formula this path
  // used before ML existed if the ML service is unavailable for any reason.
  const mlResult = await predictScores(topWithDuration);

  const topScored = mlResult
    ? topWithDuration.map((c, i) => ({
        ambulance: c.ambulance,
        score: mlResult.scores[i],
        scoreSource: "ml",
        routeSource: c.routeSource,
        etaSeconds: c.duration_seconds,
      }))
    : topWithDuration.map((c) => ({
        ambulance: c.ambulance,
        score: ruleScore(c),
        scoreSource: "rule",
        routeSource: c.routeSource,
        etaSeconds: c.duration_seconds,
      }));

  if (mlResult) {
    logger.info("Ambulance scoring used ML", { candidateCount: topWithDuration.length });
  }

  const remainingScored = remainingCandidates.map(({ ambulance, straightLineDistance }) =>
    scoreByStraightLine(ambulance, straightLineDistance)
  );

  const allScored = [...topScored, ...remainingScored].sort((a, b) => b.score - a.score);
  return allScored[0];
};

/**
 * Orchestrates a full dispatch. Scoring (ambulance selection, hospital
 * recommendation) happens first, outside any transaction, since both
 * now make real network calls (OSRM, and now the ML service). Only the
 * actual writes run inside the atomic transaction.
 */
export const dispatchEmergency = async (emergencyId) => {
  const emergency = await Emergency.findById(emergencyId);
  if (!emergency) {
    const err = new Error("Emergency not found");
    err.statusCode = 404;
    throw err;
  }
  if (emergency.status !== "waiting") {
    const err = new Error(`Emergency is already ${emergency.status}, cannot dispatch again.`);
    err.statusCode = 400;
    throw err;
  }

  const { ambulance: bestAmbulance, score, routeSource, scoreSource, etaSeconds } = await selectAmbulance(emergency);
  const hospitalResult = await recommendHospital(emergency);
  if (!hospitalResult) {
    logger.warn("Dispatching without a hospital recommendation - no eligible hospital found", {
      emergencyId: emergency._id.toString(),
    });
  }
  const hospital = hospitalResult?.hospital || null;
  const hospitalScore = hospitalResult?.score ?? null;
  const hospitalRouteSource = hospitalResult?.routeSource ?? null;

  const session = await mongoose.startSession();
  let result = null;

  try {
    await session.withTransaction(async () => {
      // Re-check status inside the transaction - it was read before the
      // transaction started, so something else could theoretically have
      // dispatched it in the gap.
      const txEmergency = await Emergency.findById(emergencyId).session(session);
      if (!txEmergency || txEmergency.status !== "waiting") {
        const err = new Error("Emergency is no longer waiting - already dispatched by another request.");
        err.statusCode = 409;
        throw err;
      }

      const crew = await assignCrewToAmbulance(bestAmbulance._id.toString(), session);
      if (!crew) {
        logger.warn("Dispatching without a crew assigned - no available crew found", {
          emergencyId: txEmergency._id.toString(),
        });
      }

      // Safety net for the ambulance-selection race: if bestAmbulance was
      // claimed by another dispatch between selectAmbulance() finishing
      // and this line, its status is no longer "available" and this
      // throws a clear error instead of double-dispatching it.
      await updateAmbulanceStatus(bestAmbulance._id.toString(), "dispatched", {}, session);
      const ambulance = await updateAmbulanceStatus(bestAmbulance._id.toString(), "onRoute", {}, session);

      txEmergency.status = "assigned";
      txEmergency.assigned_ambulance = ambulance._id;
      txEmergency.assigned_hospital = hospital ? hospital._id : null;
      await txEmergency.save({ session });

      const trip = await createTrip(ambulance, txEmergency, hospital, session);
      const alert = await createDispatchAlert(txEmergency, ambulance, session);

      result = {
        ambulance, emergency: txEmergency, trip, alert, hospital, crew,
        score, routeSource, scoreSource, etaSeconds,
        hospitalScore, hospitalRouteSource,
      };
    });

    if (!result) {
      throw new Error("Dispatch transaction failed.");
    }

    const io = getIO();
    if (io) {
      io.emit("emergency:dispatched", {
        emergencyId: result.emergency._id.toString(),
        ambulanceId: result.ambulance._id.toString(),
        hospitalId: result.hospital ? result.hospital._id.toString() : null,
        crewId: result.crew ? result.crew._id.toString() : null,
        etaSeconds: result.etaSeconds,
      });
    }

    logger.info("Emergency dispatched", {
      emergencyId: result.emergency._id.toString(),
      ambulanceId: result.ambulance._id.toString(),
      hospitalId: result.hospital ? result.hospital._id.toString() : null,
      crewId: result.crew ? result.crew._id.toString() : null,
      score: result.score,
      routeSource: result.routeSource,
      scoreSource: result.scoreSource,
      etaSeconds: result.etaSeconds,
    });

    return result;
  } finally {
    await session.endSession();
  }
};