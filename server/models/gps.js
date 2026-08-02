import mongoose from "mongoose";

// Reconstructed from gpsController.addPoint (the POST /api/gps handler) and
// every other place that does `GPS.findOne({ vehicle }).sort({ timestamp: -1 })`
// to get the latest ping. This is an append-only position log, one document
// per GPS reading, not a single row per vehicle.

const gpsSchema = new mongoose.Schema({
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
    required: true,
    index: true,
  },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  speed: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now, index: true },
});

// Matches the actual query pattern used everywhere: newest point per vehicle.
gpsSchema.index({ vehicle: 1, timestamp: -1 });

export default mongoose.model("GPS", gpsSchema);