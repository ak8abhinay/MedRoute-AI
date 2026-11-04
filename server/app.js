import express from "express";
import cors from "cors";
import ambulanceRoutes from "./routes/ambulanceRoutes.js";
import gpsRoutes from "./routes/gpsRoutes.js";
import emergencyRoutes from "./routes/emergencyRoutes.js";
import dispatchRoutes from "./routes/dispatchRoutes.js";
import hospitalRoutes from "./routes/hospitalRoutes.js";
import medicalCrewRoutes from "./routes/medicalCrewRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";

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
app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request body too large." });
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

export default app;