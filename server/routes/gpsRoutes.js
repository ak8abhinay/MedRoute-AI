import express from "express";
import { addPosition, getLatest } from "../controllers/gpsController.js";

const router = express.Router();

router.post("/", addPosition);
router.get("/latest/:ambulanceId", getLatest);

export default router;