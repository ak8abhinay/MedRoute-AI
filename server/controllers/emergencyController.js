import Emergency from "../models/emergency.js";
import { EmergencyStatus } from "../constants/emergencyStatus.js";
import { getIO } from "../services/socketService.js";
import logger from "../services/logger.js";

// Contact details from the public form are excluded by the model unless
// asked for. Staff roles ask; the simulator's service key does not.
const CONTACT_FIELDS = "+contact_name +contact_phone";
const canSeeContact = (req) => req.user?.role === "admin" || req.user?.role === "dispatcher";

const SEVERITIES = ["Low", "Medium", "High"];

/**
 * GET /api/emergencies
 * Returns all emergencies, with assigned ambulance/hospital populated.
 */
export const getEmergencies = async (req, res) => {
  try {
    let query = Emergency.find();
    if (canSeeContact(req)) query = query.select(CONTACT_FIELDS);
    const emergencies = await query.populate("assigned_ambulance assigned_hospital");
    res.json(emergencies);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

/**
 * GET /api/emergencies/:id
 * Returns a single emergency by ID, populated. 404 if not found.
 */
export const getEmergencyById = async (req, res) => {
  try {
    let query = Emergency.findById(req.params.id);
    if (canSeeContact(req)) query = query.select(CONTACT_FIELDS);
    const emergency = await query.populate("assigned_ambulance assigned_hospital");
    if (!emergency) {
      return res.status(404).json({ error: "Emergency not found" });
    }
    res.json(emergency);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * POST /api/emergencies
 * Staff reports a new emergency. Only accepts fields a reporter should be
 * able to set - status, assigned_ambulance, and assigned_hospital are
 * deliberately excluded from destructuring, so a client can never set
 * them, regardless of what's in the request body.
 */
export const reportEmergency = async (req, res) => {
  try {
    const { emergency_type, location, latitude, longitude, severity, detail } = req.body;

    const emergency = await Emergency.create({
      emergency_type,
      location,
      latitude,
      longitude,
      severity,
      detail,

      // Server-controlled fields.
      // Clients can never choose these during emergency reporting.
      status: "waiting",
      assigned_ambulance: null,
      assigned_hospital: null,
    });

    res.status(201).json(emergency);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

// Shared by confirm and reject. The status check is part of the update
// itself (atomic), so two dispatchers acting on the same request at once
// cannot both succeed.
const leavePendingReview = async (req, res, nextStatus, extraUpdate = {}) => {
  const updated = await Emergency.findOneAndUpdate(
    { _id: req.params.id, status: EmergencyStatus.PENDING_REVIEW },
    { status: nextStatus, ...extraUpdate },
    { new: true }
  );

  if (!updated) {
    const exists = await Emergency.exists({ _id: req.params.id });
    return res
      .status(exists ? 409 : 404)
      .json({ error: exists ? "Request is not awaiting review." : "Emergency not found" });
  }

  logger.info("Request reviewed", {
    emergencyId: updated._id.toString(),
    to: nextStatus,
    by: req.user.id,
  });

  const io = getIO();
  if (io) io.emit("emergency:status-change", { emergencyId: updated._id.toString(), status: updated.status });

  return res.json(updated);
};

/**
 * POST /api/emergencies/:id/confirm
 * Staff accepts a public request: pendingReview -> waiting. Dispatch is a
 * separate, existing step. Optional body { severity } lets the dispatcher
 * correct the urgency the patient picked.
 */
export const confirmEmergency = async (req, res) => {
  try {
    const { severity } = req.body || {};
    if (severity !== undefined && !SEVERITIES.includes(severity)) {
      return res.status(400).json({ error: `Severity must be one of: ${SEVERITIES.join(", ")}.` });
    }
    return await leavePendingReview(req, res, EmergencyStatus.WAITING, severity ? { severity } : {});
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * POST /api/emergencies/:id/reject
 * Staff closes a bogus/duplicate public request: pendingReview -> cancelled.
 * The patient's page shows it as closed and tells them to call 112.
 */
export const rejectEmergency = async (req, res) => {
  try {
    return await leavePendingReview(req, res, EmergencyStatus.CANCELLED);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};