import express from "express";
import { getEmergencies, getEmergencyById, reportEmergency } from "../controllers/emergencyController.js";

const router = express.Router();

router.get("/", getEmergencies);
router.get("/:id", getEmergencyById);
router.post("/", reportEmergency);

export default router;