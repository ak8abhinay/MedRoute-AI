import "dotenv/config";
import http from "http";
import mongoose from "mongoose";
import app from "./app.js";
import { initializeSocket } from "./services/socketService.js";
import logger from "./services/logger.js";
// Register Mongoose models
import "./models/ambulance.js";
import "./models/emergency.js";
import "./models/trip.js";
import "./models/alert.js";
import "./models/medicalCrew.js";
import "./models/hospital.js";
import "./models/gps.js";

// Socket.IO needs the raw HTTP server, not the Express app directly -
// that's why app.js can't own this part.
const server = http.createServer(app);

// Must run before server.listen() - every getIO() call in ambulanceService,
// emergencyService, and gpsService returns null until this has executed.
initializeSocket(server, {
  corsOrigin: process.env.FRONTEND_URL || "*",
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info("MongoDB connected");

    server.listen(PORT, () => {
      logger.info(`MedRoute AI backend listening on port ${PORT}`);
    });
  } catch (err) {
    logger.error("Failed to start server", { error: err.message });
    process.exit(1);
  }
};

startServer();