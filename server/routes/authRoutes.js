import express from "express";
import rateLimit from "express-rate-limit";
import { login, me, register } from "../controllers/authController.js";
import { authenticate, requireRole, STAFF } from "../middleware/auth.js";

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

router.post("/login", loginLimiter, login);
router.get("/me", authenticate, requireRole(...STAFF), me);
router.post("/register", authenticate, requireRole("admin"), register);

export default router;