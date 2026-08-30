import express from "express";
import cors from "cors";
import ambulanceRoutes from "./routes/ambulanceRoutes.js";
import gpsRoutes from "./routes/gpsRoutes.js";
import emergencyRoutes from "./routes/emergencyRoutes.js";
import dispatchRoutes from "./routes/dispatchRoutes.js";
import hospitalRoutes from "./routes/hospitalRoutes.js";
import medicalCrewRoutes from "./routes/medicalCrewRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/ambulances", ambulanceRoutes);
app.use("/api/gps", gpsRoutes);
app.use("/api/emergencies", emergencyRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/crew", medicalCrewRoutes);

export default app;