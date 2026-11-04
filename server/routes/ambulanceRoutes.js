import express from "express";
import {
  getAmbulances, getAmbulanceById, addAmbulance, updateAmbulance, removeAmbulance, assignCrew,
} from "../controllers/ambulanceController.js";
import { authenticate, requireRole, STAFF, STAFF_OR_SERVICE } from "../middleware/auth.js";

const router = express.Router();
router.use(authenticate);

router.get("/", requireRole(...STAFF_OR_SERVICE), getAmbulances);
router.get("/:id", requireRole(...STAFF_OR_SERVICE), getAmbulanceById);
router.post("/", requireRole("admin"), addAmbulance);
router.put("/:id", requireRole(...STAFF), updateAmbulance);
router.delete("/:id", requireRole("admin"), removeAmbulance);
router.post("/assign-crew", requireRole(...STAFF), assignCrew);

export default router;