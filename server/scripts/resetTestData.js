import "dotenv/config";
import mongoose from "mongoose";
import Ambulance from "../models/ambulance.js";
import Emergency from "../models/emergency.js";
import Trip from "../models/trip.js";
import Alert from "../models/alert.js";
import MedicalCrew from "../models/medicalCrew.js";

const KEEP_AMBULANCE_NUMBER = "AMB-001";

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected. Starting cleanup...\n");

  const keeper = await Ambulance.findOne({ ambulance_number: KEEP_AMBULANCE_NUMBER });
  if (!keeper) {
    throw new Error(`Ambulance "${KEEP_AMBULANCE_NUMBER}" not found - aborting, nothing deleted.`);
  }

  const emergencyResult = await Emergency.deleteMany({});
  console.log(`Deleted ${emergencyResult.deletedCount} emergencies`);

  const tripResult = await Trip.deleteMany({});
  console.log(`Deleted ${tripResult.deletedCount} trips`);

  const alertResult = await Alert.deleteMany({});
  console.log(`Deleted ${alertResult.deletedCount} alerts`);

  const ambulanceResult = await Ambulance.deleteMany({ _id: { $ne: keeper._id } });
  console.log(`Deleted ${ambulanceResult.deletedCount} other ambulances (kept ${KEEP_AMBULANCE_NUMBER})`);

  // Every crew member gets released - any prior pairing pointed at an
  // ambulance that either no longer exists or is about to be reset.
  const crewResult = await MedicalCrew.updateMany({}, { assigned_ambulance: null });
  console.log(`Released ${crewResult.modifiedCount} crew members`);

  // Reset the surviving ambulance to a clean starting state.
  keeper.status = "available";
  keeper.assigned_crew = null;
  await keeper.save();
  console.log(`\n${KEEP_AMBULANCE_NUMBER} reset to "available", no crew assigned.`);

  console.log("\nGPS history left untouched, as requested.");
  console.log("Cleanup complete.");

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Cleanup failed:", err.message);
  process.exit(1);
});