import Hospital from "../models/hospital.js";
import { calculateDistance } from "../utils/geoUtils.js";
import { getRoute } from "./routingService.js";
import { mapWithConcurrencyLimit } from "../utils/concurrency.js";
import { predictHospitalScores } from "./mlService.js";
import logger from "./logger.js";

const ROUTE_CANDIDATE_COUNT = Number(process.env.HOSPITAL_ROUTE_CANDIDATES) || 5;
const OSRM_SCORING_CONCURRENCY = Number(process.env.OSRM_SCORING_CONCURRENCY) || 3;

// TODO: Future hospital scoring factors:
// + Real-time bed availability feed (currently manually updated)
// + ML prediction is now live for the top OSRM-routed candidates - V1
//   distillation only, per docs/hospital-scoring-spec.md. Straight-line
//   fallback candidates remain out of ML scope, same boundary as
//   ambulance scoring.

const SEVERITY_ORDINAL = { Low: 0, Medium: 1, High: 2 };

const SEVERITY_SPECIALTY_WEIGHT = {
  High: { matchBonus: 35, mismatchPenalty: 15 },
  Medium: { matchBonus: 20, mismatchPenalty: 0 },
  Low: { matchBonus: 10, mismatchPenalty: 0 },
};

const specialtyMatch = (hospital, emergency) => !!hospital.specialties?.includes(emergency.emergency_type);

// The frozen V1 formula (docs/hospital-scoring-spec.md), extracted so
// it's both the ML fallback AND the only formula this path used before
// ML existed - same function, two callers, exactly like ambulance
// scoring's ruleScore.
const ruleScore = ({ distance_penalty, severity, specialty_match, available_beds }) => {
  const severityName = Object.keys(SEVERITY_ORDINAL).find((k) => SEVERITY_ORDINAL[k] === severity);
  const weights = SEVERITY_SPECIALTY_WEIGHT[severityName];
  const specialtyScore = specialty_match ? weights.matchBonus : -weights.mismatchPenalty;
  return 100 - distance_penalty + specialtyScore + available_beds;
};

// Straight-line candidates beyond the pre-filter - UNCHANGED, out of ML
// scope, same boundary as ambulance scoring's remaining-candidate path.
const scoreByStraightLine = (hospital, straightLineDistance, emergency) => {
  const distance_penalty = Math.min(straightLineDistance / 500, 40);
  const severity = SEVERITY_ORDINAL[emergency.severity];
  const specialty_match = specialtyMatch(hospital, emergency);
  const available_beds = Math.min(hospital.available_beds, 20);
  return {
    hospital,
    score: ruleScore({ distance_penalty, severity, specialty_match, available_beds }),
    scoreSource: "rule-straightline",
    routeSource: null,
  };
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

  // Real durations + pre-computed feature vector for the top candidates -
  // no scoring decided yet, same two-step separation as ambulance scoring.
  const topWithFeatures = await mapWithConcurrencyLimit(topCandidates, OSRM_SCORING_CONCURRENCY, async ({ hospital }) => {
    const route = await getRoute(hospital.latitude, hospital.longitude, emergency.latitude, emergency.longitude);
    return {
      hospital,
      distance_penalty: Math.min(route.duration / 45, 40),
      severity: SEVERITY_ORDINAL[emergency.severity],
      specialty_match: specialtyMatch(hospital, emergency),
      available_beds: Math.min(hospital.available_beds, 20),
      routeSource: route.source,
    };
  });

  // ONE batched ML call, only on the routed candidates - the frozen V1
  // scope boundary, same as ambulance scoring.
  const mlResult = await predictHospitalScores(topWithFeatures);

  const topScored = mlResult
    ? topWithFeatures.map((c, i) => ({ hospital: c.hospital, score: mlResult.scores[i], scoreSource: "ml", routeSource: c.routeSource }))
    : topWithFeatures.map((c) => ({ hospital: c.hospital, score: ruleScore(c), scoreSource: "rule", routeSource: c.routeSource }));

  if (mlResult) {
    logger.info("Hospital scoring used ML", { candidateCount: topWithFeatures.length });
  }

  const remainingScored = remainingCandidates.map(({ hospital, straightLineDistance }) =>
    scoreByStraightLine(hospital, straightLineDistance, emergency)
  );

  const best = [...topScored, ...remainingScored].sort((a, b) => b.score - a.score)[0];

  logger.info("Hospital recommended", {
    emergencyId: emergency._id.toString(),
    hospitalId: best.hospital._id.toString(),
    score: best.score,
    scoreSource: best.scoreSource,
    routeSource: best.routeSource,
  });

  return { hospital: best.hospital, score: best.score, routeSource: best.routeSource, scoreSource: best.scoreSource };
};