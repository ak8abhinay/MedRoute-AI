import { createPublicRequest, findByToken, buildTrackingView } from "../services/trackingService.js";
import { isInServiceArea } from "../constants/serviceArea.js";
import { getIO } from "../services/socketService.js";
import logger from "../services/logger.js";

const TYPES = ["cardiac", "trauma", "general"];
const URGENCY_TO_SEVERITY = { life_threatening: "High", serious: "Medium", not_life_threatening: "Low" };
const GENERIC_FAILURE = "Could not submit the request. If this is an emergency, call 112.";

const isText = (v, min, max) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max;

// Only whitelisted fields are ever read, and every one is checked for
// type, length and range. Returns { error } or { value }.
const validateCreate = (body) => {
  if (!body || typeof body !== "object") return { error: "Invalid request." };
  const { emergency_type, urgency, location, latitude, longitude, contact_name, contact_phone, detail, website } = body;

  // Honeypot. Rejected explicitly, not silently accepted: a password
  // manager that autofills the hidden field must never make a real
  // emergency disappear.
  if (website) return { error: GENERIC_FAILURE };

  if (!TYPES.includes(emergency_type)) return { error: `Emergency type must be one of: ${TYPES.join(", ")}.` };
  // hasOwn, not a plain lookup: "constructor" or "__proto__" would
  // otherwise resolve to a truthy inherited property.
  if (typeof urgency !== "string" || !Object.hasOwn(URGENCY_TO_SEVERITY, urgency)) {
    return { error: "Urgency must be life_threatening, serious or not_life_threatening." };
  }
  if (!isText(location, 3, 200)) return { error: "Location must be 3-200 characters." };

  if (typeof latitude !== "number" || typeof longitude !== "number" || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { error: "Latitude and longitude must be numbers." };
  }
  if (!isInServiceArea(latitude, longitude)) {
    return { error: "This location is outside our current service area. If this is an emergency, call 112." };
  }

  const digits = typeof contact_phone === "string" ? contact_phone.replace(/\D/g, "") : "";
  if (!isText(contact_phone, 7, 25) || !/^[+0-9 ()-]+$/.test(contact_phone) || digits.length < 7 || digits.length > 15) {
    return { error: "A valid contact phone number is required." };
  }

  if (contact_name !== undefined && contact_name !== "" && !isText(contact_name, 1, 80)) {
    return { error: "Contact name must be 1-80 characters." };
  }
  if (detail !== undefined && detail !== "" && !isText(detail, 1, 500)) {
    return { error: "Details must be at most 500 characters." };
  }

  return {
    value: {
      emergency_type,
      severity: URGENCY_TO_SEVERITY[urgency],
      location: location.trim(),
      latitude,
      longitude,
      contact_phone: contact_phone.trim(),
      contact_name: contact_name ? contact_name.trim() : undefined,
      detail: detail ? detail.trim() : undefined,
    },
  };
};

export const createRequest = async (req, res) => {
  try {
    const result = validateCreate(req.body);
    if (result.error) return res.status(400).json({ error: result.error });

    const { request, token } = await createPublicRequest(result.value);

    // Event carries an id only - no contact details, nothing sensitive.
    const io = getIO();
    if (io) io.emit("emergency:created", { emergencyId: request._id.toString() });

    // Never log the phone number or the token.
    logger.info("Public request created", { emergencyId: request._id.toString(), reference: request.reference });

    res.status(201).json({
      reference: request.reference,
      tracking_token: token,
      tracking_expires_at: request.tracking_expires_at,
      status: request.status,
    });
  } catch (e) {
    logger.error("Public request failed", { error: e.message });
    res.status(500).json({ error: GENERIC_FAILURE }); // internal details are not shown to the public
  }
};

export const trackRequest = async (req, res) => {
  try {
    // Token travels in a header, not the URL, so it stays out of access logs.
    const emergency = await findByToken(req.get("x-tracking-token"));
    // One answer for unknown, malformed and expired - they must not be distinguishable.
    if (!emergency) return res.status(404).json({ error: "Request not found, or the link has expired." });

    res.set("Cache-Control", "no-store");
    res.json(await buildTrackingView(emergency));
  } catch (e) {
    logger.error("Tracking read failed", { error: e.message });
    res.status(500).json({ error: "Could not load your request. If this is an emergency, call 112." });
  }
};