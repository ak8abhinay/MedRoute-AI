import mongoose from "mongoose";

// Translated from the reference repo's Driver.js. Only `assigned_vehicle`
// (here: assigned_ambulance) was directly confirmed by code there - it's
// the only field ever populated or written to (driverController.js's
// assignVehicle keeps it in sync bidirectionally with Vehicle.assigned_driver).
// name/phone are reasonable additions, not confirmed by their code, since a
// crew record with nothing identifying the person isn't useful. Adjust freely.

const medicalCrewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, default: "" },

    // e.g. "paramedic", "EMT", "driver" - optional, add if you want to
    // distinguish crew roles later (not present in the reference at all,
    // their model was driver-only, not a full crew concept)
   role: {
    type: String,
    enum: ["Driver", "Paramedic", "EMT", "Doctor", "Nurse"],
    required: true,
  },

    assigned_ambulance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ambulance",
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("MedicalCrew", medicalCrewSchema);