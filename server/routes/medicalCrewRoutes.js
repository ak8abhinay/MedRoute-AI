import express from "express";
import { getCrew, getCrewById, addCrew, updateCrew, removeCrew } from "../controllers/medicalCrewController.js";
import { authenticate, requireRole, STAFF } from "../middleware/auth.js";

const router = express.Router();
router.use(authenticate, requireRole(...STAFF));

router.get("/", getCrew);
router.get("/:id", getCrewById);
router.post("/", requireRole("admin"), addCrew);
router.put("/:id", updateCrew);
router.delete("/:id", requireRole("admin"), removeCrew);

export default router;