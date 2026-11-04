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
        EmergencyStatus.PENDING_REVIEW,
        EmergencyStatus.WAITING,
        EmergencyStatus.ASSIGNED,
        EmergencyStatus.AT_SCENE,
        EmergencyStatus.AWAITING_HOSPITAL,
        EmergencyStatus.TRANSPORTING,
        EmergencyStatus.RESOLVED,
        EmergencyStatus.CANCELLED,
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

    // --- public (patient/family) requests ---
    source: { type: String, enum: ["staff", "public"], default: "staff" },

    // NO `default: null` on the two unique fields below. A sparse unique
    // index skips documents where the field is MISSING but still indexes
    // null, so a null default would make every staff-created emergency
    // collide with the next one.
    reference: { type: String, index: { unique: true, sparse: true } },
    tracking_token_hash: { type: String, select: false, index: { unique: true, sparse: true } },
    tracking_expires_at: { type: Date },

    // Personal data: hidden from every query unless explicitly requested
    // with .select("+contact_name +contact_phone"). Only the staff read
    // paths do that - never the simulator's key, never a populate.
    contact_name: { type: String, select: false },
    contact_phone: { type: String, select: false },
  },
  { timestamps: true }
);

export default mongoose.model("Emergency", emergencySchema);