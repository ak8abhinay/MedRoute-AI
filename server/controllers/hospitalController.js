import Hospital from "../models/hospital.js";

export const getHospitals = async (_req, res) => {
  try {
    const hospitals = await Hospital.find();
    res.json(hospitals);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const getHospitalById = async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id);
    if (!hospital) {
      return res.status(404).json({ error: "Hospital not found" });
    }
    res.json(hospital);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const addHospital = async (req, res) => {
  try {
    const hospital = await Hospital.create(req.body);
    res.status(201).json(hospital);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * PUT /api/hospitals/:id
 * available_beds is the field expected to change most often (occupancy
 * shifting in real time) - everything else on the model is relatively
 * static, so no field whitelist needed here the way ambulance/emergency
 * needed one. Nothing on this model represents a workflow relationship
 * a client shouldn't control.
 */
export const updateHospital = async (req, res) => {
  try {
    const hospital = await Hospital.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!hospital) {
      return res.status(404).json({ error: "Hospital not found" });
    }
    res.json(hospital);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

export const removeHospital = async (req, res) => {
  try {
    const hospital = await Hospital.findByIdAndDelete(req.params.id);
    if (!hospital) {
      return res.status(404).json({ error: "Hospital not found" });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};