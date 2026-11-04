import express from "express";
import {
  getHospitals, getHospitalById, addHospital, updateHospital, removeHospital,
} from "../controllers/hospitalController.js";
import { authenticate, requireRole, STAFF } from "../middleware/auth.js";

const router = express.Router();
router.use(authenticate, requireRole(...STAFF));

router.get("/", getHospitals);
router.get("/:id", getHospitalById);
router.post("/", requireRole("admin"), addHospital);
router.put("/:id", updateHospital);
router.delete("/:id", requireRole("admin"), removeHospital);

export default router;