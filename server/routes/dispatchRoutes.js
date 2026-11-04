import express from "express";
import { dispatch } from "../controllers/dispatchController.js";
import { authenticate, requireRole, STAFF } from "../middleware/auth.js";

const router = express.Router();
router.use(authenticate, requireRole(...STAFF));

router.post("/:emergencyId", dispatch);

export default router;