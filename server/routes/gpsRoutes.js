import express from "express";
import { addPosition, getLatest } from "../controllers/gpsController.js";
import { authenticate, requireRole, STAFF, STAFF_OR_SERVICE } from "../middleware/auth.js";

const router = express.Router();
router.use(authenticate);

router.post("/", requireRole(...STAFF_OR_SERVICE), addPosition);
router.get("/latest/:ambulanceId", requireRole(...STAFF), getLatest);

export default router;