import mongoose from "mongoose";

const emergencySchema = new mongoose.Schema(
  {
    emergency_type: { type: String, required: true }, // e.g. "cardiac", "accident"
    location: { type: String, required: true },        // human-readable label
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },

    // matches what alert.js already reads as emergency.severity
    severity: {
      type: String,
      enum: ["Low", "Medium", "High"],
      required: true,
    },

    status: {
      type: String,
      enum: ["waiting", "pending_confirmation", "assigned", "resolved"],
      default: "waiting",
    },

    assigned_ambulance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ambulance",
      default: null,
    },

    assigned_hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      default: null,
    },

    detail: { type: String, default: "" },
    reported_date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Emergency", emergencySchema);