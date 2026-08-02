import mongoose from "mongoose";

// Translated from the reference repo's Trip.js. Same business rule carries
// over: only one "ongoing" trip per ambulance at a time; multiple
// "completed" trips are fine.

const tripSchema = new mongoose.Schema(
  {
    ambulance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ambulance",
      required: true,
    },
    crew: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MedicalCrew",
      default: null,
    },
    emergency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Emergency",
      default: null,
    },
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      default: null,
    },

    start_time: { type: Date, default: Date.now },
    end_time: { type: Date, default: null },

    // Kept as free-form strings, same as the reference - "Station" instead
    // of their "Depot" default. end_location could later become a ref to
    // a Hospital model once you build the hospital-recommendation piece,
    // instead of a plain string.
    start_location: { type: String, default: "Station" },
    end_location: { type: String, default: null },

    status: {
      type: String,
      enum: ["ongoing", "completed"],
      default: "ongoing",
    },

    // Optional dispatcher who manually managed the trip - only keep this
    // if you're actually building a dispatcher login (userController.js's flow).
    managed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Trip", tripSchema);