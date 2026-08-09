import express from "express";
import { getCrew, getCrewById, addCrew, updateCrew, removeCrew } from "../controllers/medicalCrewController.js";

const router = express.Router();

router.get("/", getCrew);
router.get("/:id", getCrewById);
router.post("/", addCrew);
router.put("/:id", updateCrew);
router.delete("/:id", removeCrew);

export default router;