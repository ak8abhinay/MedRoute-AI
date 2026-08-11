import Emergency from "../models/emergency.js";

/**
 * GET /api/emergencies
 * Returns all emergencies, with assigned ambulance/hospital populated.
 */
export const getEmergencies = async (_req, res) => {
  try {
    const emergencies = await Emergency.find().populate("assigned_ambulance assigned_hospital");
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
    const emergency = await Emergency.findById(req.params.id).populate(
      "assigned_ambulance assigned_hospital"
    );
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
 * Reports a new emergency. Only accepts fields a reporter should be able
 * to set - status, assigned_ambulance, and assigned_hospital are
 * deliberately excluded from destructuring, so a client can never set
 * them, regardless of what's in the request body. Those fields are
 * owned exclusively by dispatchService (status/assigned_ambulance) and
 * the hospital recommendation logic (assigned_hospital).
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