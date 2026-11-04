import crypto from "crypto";
import Emergency from "../models/emergency.js";
import { EmergencyStatus } from "../constants/emergencyStatus.js";
import { getRoute } from "./routingService.js";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes as base64url, no padding
// No I, L, O, 0 or 1 - unambiguous when read out over the phone.
const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROUTE_POINT_CAP = 150;

export const STATUS_LABELS = {
  [EmergencyStatus.PENDING_REVIEW]: "Request received. A dispatcher is reviewing it.",
  [EmergencyStatus.WAITING]: "Request confirmed. Assigning an ambulance.",
  [EmergencyStatus.ASSIGNED]: "An ambulance is on the way.",
  [EmergencyStatus.AT_SCENE]: "The ambulance has arrived.",
  [EmergencyStatus.AWAITING_HOSPITAL]: "The ambulance has arrived. A hospital is being arranged.",
  [EmergencyStatus.TRANSPORTING]: "On the way to the hospital.",
  [EmergencyStatus.RESOLVED]: "Completed.",
  [EmergencyStatus.CANCELLED]: "This request was closed by the dispatcher. If you still need help, call 112.",
};

const generateToken = () => crypto.randomBytes(32).toString("base64url");

// The token carries 256 bits of entropy, so a fast hash is the right tool
// here (slow hashes like bcrypt exist for low-entropy passwords). Only the
// hash is stored; a database leak does not leak working tracking links.
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const generateReference = () => {
  const pick = (n) =>
    Array.from({ length: n }, () => REFERENCE_ALPHABET[crypto.randomInt(REFERENCE_ALPHABET.length)]).join("");
  return `MR-${pick(4)}-${pick(4)}`;
};

/**
 * Creates a public request in pendingReview. Returns the new document and
 * the raw token - the only moment the raw token exists server-side.
 */
export const createPublicRequest = async (input) => {
  const token = generateToken();
  const tracking_token_hash = hashToken(token);
  const tracking_expires_at = new Date(Date.now() + TOKEN_TTL_MS);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const request = await Emergency.create({
        emergency_type: input.emergency_type,
        severity: input.severity,
        location: input.location,
        latitude: input.latitude,
        longitude: input.longitude,
        detail: input.detail,
        contact_name: input.contact_name,
        contact_phone: input.contact_phone,
        status: EmergencyStatus.PENDING_REVIEW,
        assigned_ambulance: null,
        assigned_hospital: null,
        source: "public",
        reference: generateReference(),
        tracking_token_hash,
        tracking_expires_at,
      });
      return { request, token };
    } catch (err) {
      const referenceCollision = err.code === 11000 && (err.keyPattern?.reference || /reference/.test(err.message));
      if (!referenceCollision) throw err;
    }
  }
  throw new Error("Could not allocate a unique reference.");
};

/**
 * Looks a request up by its raw token. Returns null for anything wrong -
 * malformed, unknown or expired - so callers cannot tell those apart.
 */
export const findByToken = async (token) => {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;

  const emergency = await Emergency.findOne({ tracking_token_hash: hashToken(token), source: "public" })
    .populate("assigned_ambulance", "ambulance_number latitude longitude")
    .populate("assigned_hospital", "name latitude longitude");

  if (!emergency || !emergency.tracking_expires_at || emergency.tracking_expires_at < new Date()) return null;
  return emergency;
};

const downsample = (points) => {
  if (points.length <= ROUTE_POINT_CAP) return points;
  const step = Math.ceil(points.length / ROUTE_POINT_CAP);
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
};

/**
 * The patient's whole view of their request. Everything a patient may
 * see is listed here explicitly - no crew, no scores, no other requests,
 * no contact details.
 */
export const buildTrackingView = async (emergency) => {
  const ambulance = emergency.assigned_ambulance;
  const hospital = emergency.assigned_hospital;
  const ambulanceHasPosition = ambulance && ambulance.latitude != null && ambulance.longitude != null;

  // Which leg the ambulance is on decides where the route points.
  let target = null;
  if (ambulanceHasPosition) {
    if (emergency.status === EmergencyStatus.ASSIGNED) {
      target = { latitude: emergency.latitude, longitude: emergency.longitude };
    } else if (emergency.status === EmergencyStatus.TRANSPORTING && hospital) {
      target = { latitude: hospital.latitude, longitude: hospital.longitude };
    }
  }

  let route = null;
  let etaSeconds = null;
  if (target) {
    // getRoute never throws: on an OSRM failure it returns a straight-line
    // estimate and says so in `source`.
    const r = await getRoute(ambulance.latitude, ambulance.longitude, target.latitude, target.longitude);
    etaSeconds = Math.round(r.duration);
    route = {
      source: r.source,
      points: downsample(r.waypoints.map((p) => [p.latitude, p.longitude])),
    };
  }

  return {
    reference: emergency.reference,
    status: emergency.status,
    status_label: STATUS_LABELS[emergency.status] || "Status unavailable.",
    patient_location: { latitude: emergency.latitude, longitude: emergency.longitude },
    ambulance: ambulance
      ? { number: ambulance.ambulance_number, latitude: ambulance.latitude, longitude: ambulance.longitude }
      : null,
    hospital: hospital ? { name: hospital.name, latitude: hospital.latitude, longitude: hospital.longitude } : null,
    eta_seconds: etaSeconds,
    route,
    updated_at: new Date().toISOString(),
  };
};