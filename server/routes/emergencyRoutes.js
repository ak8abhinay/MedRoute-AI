import express from "express";
import {
  getEmergencies,
  getEmergencyById,
  reportEmergency,
  confirmEmergency,
  rejectEmergency,
} from "../controllers/emergencyController.js";
import { authenticate, requireRole, STAFF, STAFF_OR_SERVICE } from "../middleware/auth.js";

const router = express.Router();
router.use(authenticate);

router.get("/", requireRole(...STAFF_OR_SERVICE), getEmergencies);
router.get("/:id", requireRole(...STAFF_OR_SERVICE), getEmergencyById);
router.post("/", requireRole(...STAFF), reportEmergency);
router.post("/:id/confirm", requireRole(...STAFF), confirmEmergency);
router.post("/:id/reject", requireRole(...STAFF), rejectEmergency);

export default router;