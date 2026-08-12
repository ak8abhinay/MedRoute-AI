import Hospital from "../models/hospital.js";
import { calculateDistance } from "../utils/geoUtils.js";
import { getRoute } from "./routingService.js";
import { mapWithConcurrencyLimit } from "../utils/concurrency.js";
import logger from "./logger.js";

const ROUTE_CANDIDATE_COUNT = Number(process.env.HOSPITAL_ROUTE_CANDIDATES) || 5;
const OSRM_SCORING_CONCURRENCY = Number(process.env.OSRM_SCORING_CONCURRENCY) || 3;

// TODO: Future hospital scoring factors:
// + Real-time bed availability feed (currently manually updated)
// + ML prediction

// A specialty match matters more the more severe the case is. A
// High-severity trauma case genuinely needs a trauma-capable hospital -
// sending it elsewhere is a real, costly mistake, not just a missed
// bonus, so mismatch is actively penalized at High severity. A
// Low-severity case could reasonably go almost anywhere, so a mismatch
// there costs nothing.
const SEVERITY_SPECIALTY_WEIGHT = {
  High: { matchBonus: 35, mismatchPenalty: 15 },
  Medium: { matchBonus: 20, mismatchPenalty: 0 },
  Low: { matchBonus: 10, mismatchPenalty: 0 },
};

const scoreSpecialtyMatch = (hospital, emergency) => {
  const weights = SEVERITY_SPECIALTY_WEIGHT[emergency.severity] || SEVERITY_SPECIALTY_WEIGHT.Medium;
  const hasMatch = hospital.specialties?.includes(emergency.emergency_type);
  return hasMatch ? weights.matchBonus : -weights.mismatchPenalty;
};

// Shared by both routed and straight-line scoring - only the
// "how far/long" term actually differs between the two paths; every
// other factor that makes a hospital a good pick is identical either
// way, so it's computed once here instead of duplicated across both.
const composeScore = (distancePenalty, hospital, emergency) => {
  let score = 100;
  score -= distancePenalty;
  score += scoreSpecialtyMatch(hospital, emergency);
  score += Math.min(hospital.available_beds, 20);
  return score;
};

const scoreByRoute = async (hospital, emergency) => {
  const route = await getRoute(hospital.latitude, hospital.longitude, emergency.latitude, emergency.longitude);
  const distancePenalty = Math.min(route.duration / 45, 40);
  return { hospital, score: composeScore(distancePenalty, hospital, emergency), routeSource: route.source };
};

const scoreByStraightLine = (hospital, straightLineDistance, emergency) => {
  const distancePenalty = Math.min(straightLineDistance / 500, 40);
  return { hospital, score: composeScore(distancePenalty, hospital, emergency), routeSource: null };
};

export const recommendHospital = async (emergency) => {
  const hospitals = await Hospital.find({
    status: "operational",
    available_beds: { $gt: 0 },
  });

  if (hospitals.length === 0) {
    logger.warn("No eligible hospitals found for recommendation", { emergencyId: emergency._id.toString() });
    return null;
  }

  const withStraightLine = hospitals
    .map((hospital) => ({
      hospital,
      straightLineDistance: calculateDistance(hospital.latitude, hospital.longitude, emergency.latitude, emergency.longitude),
    }))
    .sort((a, b) => a.straightLineDistance - b.straightLineDistance);

  const topCandidates = withStraightLine.slice(0, ROUTE_CANDIDATE_COUNT);
  const remainingCandidates = withStraightLine.slice(ROUTE_CANDIDATE_COUNT);

  const routedScores = await mapWithConcurrencyLimit(topCandidates, OSRM_SCORING_CONCURRENCY, ({ hospital }) =>
    scoreByRoute(hospital, emergency)
  );
  const remainingScores = remainingCandidates.map(({ hospital, straightLineDistance }) =>
    scoreByStraightLine(hospital, straightLineDistance, emergency)
  );

  const best = [...routedScores, ...remainingScores].sort((a, b) => b.score - a.score)[0];

  logger.info("Hospital recommended", {
    emergencyId: emergency._id.toString(),
    hospitalId: best.hospital._id.toString(),
    score: best.score,
    routeSource: best.routeSource,
  });

  // Was: return best.hospital;  Now returns the score alongside it, so
  // callers can surface it the same way ambulance scoring already does.
  return { hospital: best.hospital, score: best.score, routeSource: best.routeSource };
};