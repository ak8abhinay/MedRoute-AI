import express from "express";
import {
  getHospitals,
  getHospitalById,
  addHospital,
  updateHospital,
  removeHospital,
} from "../controllers/hospitalController.js";

const router = express.Router();

router.get("/", getHospitals);
router.get("/:id", getHospitalById);
router.post("/", addHospital);
router.put("/:id", updateHospital);
router.delete("/:id", removeHospital);

export default router;