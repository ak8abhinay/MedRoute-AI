import mongoose from "mongoose";
import { AmbulanceStatus } from "../constants/ambulanceStatus.js";

// Translated from the reference repo's Vehicle.js. Field meanings unchanged,
// just renamed to match the ambulance dispatch domain.

const ambulanceSchema = new mongoose.Schema(
  {
    ambulance_number: {
      type: String,
      required: true,
      unique: true,
    },

    // Same transitions as the reference: available -> dispatched -> onRoute
    // -> working -> available. Once "working" (i.e. at the scene / treating
    // a patient), it can only go back to "available" - not get redispatched
    // mid-call. Enforce that guard in your controller, same as vehicleController.js did.
    status: {
      type: String,
      enum: Object.values(AmbulanceStatus),
      default: AmbulanceStatus.AVAILABLE,
    },

    // ref must exactly match mongoose.model("...") in your medicalCrew.js
    assigned_crew: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MedicalCrew",
      default: null,
    },

    // Fallback/seed coordinates for when no GPS document exists yet -
    // swap the reference repo's Karachi fallback (24.8607/67.0011) for
    // wherever you're basing MEDROUTE AI, or leave null and handle the
    // fallback in code instead of baking a city into the schema comment.
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Ambulance", ambulanceSchema);