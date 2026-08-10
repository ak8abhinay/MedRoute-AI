import mongoose from "mongoose";
import { EmergencyStatus } from "../constants/emergencyStatus.js";

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
      enum: [
        EmergencyStatus.WAITING,
        EmergencyStatus.ASSIGNED,
        EmergencyStatus.AT_SCENE,
        EmergencyStatus.AWAITING_HOSPITAL,
        EmergencyStatus.TRANSPORTING,
        EmergencyStatus.RESOLVED,
      ],
      default: EmergencyStatus.WAITING,
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