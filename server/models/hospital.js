import mongoose from "mongoose";

// New model - doesn't exist in the reference repo at all, since it never
// built hospital recommendation. Fields chosen based on what your AI
// recommendation logic actually needs to score a hospital: how far it is,
// whether it has room, and whether it can handle the emergency type.

const hospitalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    location: { type: String, required: true }, // human-readable address/label
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },

    total_beds: { type: Number, required: true, min: 0 },

    // Changes constantly in a real system - this is the field most likely
    // to go stale. See note below on how to handle that.
    available_beds: { type: Number, required: true, min: 0 },

    // What this hospital can actually treat - your recommendation logic
    // would filter/score against this for severity/type matching.
    // e.g. ["trauma", "cardiac", "pediatric", "burn", "general"]
    specialties: { type: [String], default: ["general"] },

    has_icu: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ["operational", "full", "closed"],
      default: "operational",
    },

    contact_number: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Hospital", hospitalSchema);