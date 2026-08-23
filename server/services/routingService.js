import axios from "axios";
import { calculateDistance } from "../utils/geoUtils.js";
import logger from "./logger.js";

const OSRM_BASE_URL = process.env.OSRM_BASE_URL || "http://localhost:5001";
const OSRM_TIMEOUT_MS = Number(process.env.OSRM_TIMEOUT_MS) || 5000;

// Circuit breaker - avoids hammering a genuinely down OSRM instance with
// repeated slow-timeout requests. After 3 consecutive failures, skip OSRM
// entirely for 60 seconds and go straight to the fallback; then allow one
// trial request through to see if it's recovered.
const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_MS = 60000;
let circuitState = "closed"; // "closed" | "open" | "half-open"
let consecutiveFailures = 0;
let circuitOpenedAt = null;

const isCircuitOpen = () => {
  if (circuitState !== "open") return false;
  if (Date.now() - circuitOpenedAt > OPEN_DURATION_MS) {
    circuitState = "half-open"; // allow one trial request through
    return false;
  }
  return true;
};

const recordSuccess = () => {
  consecutiveFailures = 0;
  circuitState = "closed";
};

const recordFailure = () => {
  consecutiveFailures += 1;
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitState = "open";
    circuitOpenedAt = Date.now();
    logger.warn("Routing circuit breaker opened - OSRM will be skipped for 60s", {
      consecutiveFailures,
    });
  }
};

// Simple in-memory route cache - real OSRM routes cached longer than
// fallback (Haversine) routes, since a fallback route is a rough
// approximation we'd rather re-check sooner if OSRM comes back.
const routeCache = new Map(); // key -> { data, expiresAt }
const CACHE_TTL_REAL_MS = 5 * 60 * 1000;
const CACHE_TTL_FALLBACK_MS = 60 * 1000;

const getCacheKey = (startLat, startLng, endLat, endLng) => {
  // Rounded to ~11m precision so tiny GPS jitter between calls still hits
  // the same cache entry instead of missing on every request.
  const r = (n) => n.toFixed(4);
  return `${r(startLat)},${r(startLng)}->${r(endLat)},${r(endLng)}`;
};

const getFromCache = (key) => {
  const entry = routeCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    routeCache.delete(key);
    return null;
  }
  return entry.data;
};

const setCache = (key, data, ttlMs) => {
  routeCache.set(key, { data, expiresAt: Date.now() + ttlMs });
};

/**
 * Initial compass bearing (0-360, 0 = north) from point 1 to point 2.
 * Used for rotating an ambulance icon on the map to face its direction
 * of travel - not used for distance/duration at all.
 */
export const calculateBearing = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);

  const bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
};

/**
 * Calls OSRM directly. Note the coordinate order: OSRM expects
 * "longitude,latitude" - the reverse of how every model in this project
 * (Ambulance, Emergency, GPS) stores latitude/longitude. Getting this
 * backwards silently produces a route in the wrong part of the world
 * rather than an obvious error - worth double-checking if a route ever
 * looks wrong.
 */
const fetchFromOSRM = async (startLat, startLng, endLat, endLng) => {
  const url = `${OSRM_BASE_URL}/route/v1/driving/${startLng},${startLat};${endLng},${endLat}`;

  const response = await axios.get(url, {
    params: { overview: "full", geometries: "geojson" },
    timeout: OSRM_TIMEOUT_MS,
  });

  const route = response.data?.routes?.[0];
  if (!route) {
    throw new Error("OSRM returned no route");
  }

  // OSRM's geometry.coordinates is an array of [lng, lat] pairs -
  // converted here to {latitude, longitude} to match this project's
  // convention everywhere else.
  const waypoints = (route.geometry?.coordinates || []).map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  }));

  return {
    distance: route.distance, // meters
    duration: route.duration, // seconds
    waypoints,
    source: "osrm",
  };
};

/**
 * Straight-line (Haversine) fallback when OSRM is unavailable or the
 * circuit breaker is open. Not a real road-following route - just a
 * start and end point, with duration estimated from an assumed average
 * speed. Good enough for "roughly how far/long," not for actually
 * driving a simulator along a realistic path.
 */
const buildFallbackRoute = (startLat, startLng, endLat, endLng) => {
  const distanceMeters = calculateDistance(startLat, startLng, endLat, endLng);
  const ASSUMED_SPEED_KMH = 40;
  const durationSeconds = (distanceMeters / 1000 / ASSUMED_SPEED_KMH) * 3600;

  return {
    distance: distanceMeters,
    duration: durationSeconds,
    waypoints: [
      { latitude: startLat, longitude: startLng },
      { latitude: endLat, longitude: endLng },
    ],
    source: "haversine",
  };
};

/**
 * Gets a route between two points - the one function everything else
 * (dispatchService for ETA, a future simulator for movement) should
 * call. Tries OSRM first (unless the circuit breaker is open), caches
 * the result, and falls back to a straight-line estimate on any failure.
 * Never throws - always returns a usable route, with `source` telling
 * the caller which kind they got.
 */
export const getRoute = async (startLat, startLng, endLat, endLng) => {
  const cacheKey = getCacheKey(startLat, startLng, endLat, endLng);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  if (!isCircuitOpen()) {
    try {
      const route = await fetchFromOSRM(startLat, startLng, endLat, endLng);
      recordSuccess();
      setCache(cacheKey, route, CACHE_TTL_REAL_MS);
      return route;
    } catch (err) {
      recordFailure();
      logger.warn("OSRM request failed, falling back to straight-line route", {
        error: err.message,
      });
    }
  } else {
    logger.info("Routing circuit breaker open - skipping OSRM, using fallback directly");
  }

  const fallback = buildFallbackRoute(startLat, startLng, endLat, endLng);
  setCache(cacheKey, fallback, CACHE_TTL_FALLBACK_MS);
  return fallback;
};