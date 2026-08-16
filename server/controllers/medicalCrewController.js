import MedicalCrew from "../models/medicalCrew.js";

export const getCrew = async (_req, res) => {
  try {
    const crew = await MedicalCrew.find().populate("assigned_ambulance");
    res.json(crew);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const getCrewById = async (req, res) => {
  try {
    const member = await MedicalCrew.findById(req.params.id).populate("assigned_ambulance");
    if (!member) {
      return res.status(404).json({ error: "Crew member not found" });
    }
    res.json(member);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * POST /api/crew
 * Creates a crew member. assigned_ambulance is deliberately excluded -
 * that relationship is only ever set through ambulanceController's
 * assignCrew, which validates both sides (crew not already assigned
 * elsewhere, ambulance doesn't already have someone) inside a
 * transaction. Creating a crew member pre-assigned would bypass all of
 * that - same category of gap the emergency/ambulance whitelist fixes
 * closed earlier.
 */
export const addCrew = async (req, res) => {
  try {
    const { name, phone, role } = req.body;

    const member = await MedicalCrew.create({
      name,
      phone,
      role,
      assigned_ambulance: null, // server-controlled - see docstring
    });

    res.status(201).json(member);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * PUT /api/crew/:id
 * Same whitelist reasoning as addCrew - assigned_ambulance is excluded
 * here too, so editing a crew member's name/phone/role can never
 * accidentally (or deliberately) reassign them outside assignCrew's
 * validated path.
 */
export const updateCrew = async (req, res) => {
  try {
    const { name, phone, role } = req.body;

    const member = await MedicalCrew.findByIdAndUpdate(
      req.params.id,
      { name, phone, role },
      { new: true }
    );

    if (!member) {
      return res.status(404).json({ error: "Crew member not found" });
    }
    res.json(member);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * DELETE /api/crew/:id
 * Refuses to delete a crew member who's currently assigned to an
 * ambulance - deleting them would leave Ambulance.assigned_crew pointing
 * at a document that no longer exists. Must be unassigned first (via
 * assignCrew, or a future "unassign" flow) before deletion.
 */
export const removeCrew = async (req, res) => {
  try {
    const member = await MedicalCrew.findById(req.params.id);
    if (!member) {
      return res.status(404).json({ error: "Crew member not found" });
    }
    if (member.assigned_ambulance) {
      return res.status(400).json({
        error: "Cannot delete crew member while assigned to an ambulance. Unassign first.",
      });
    }

    await MedicalCrew.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};