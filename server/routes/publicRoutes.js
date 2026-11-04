import express from "express";
import rateLimit from "express-rate-limit";
import { createRequest, trackRequest } from "../controllers/publicController.js";

// Intentionally PUBLIC: no `authenticate` here. This router must never
// import a staff controller or expose staff data. Behind a reverse proxy,
// set app.set("trust proxy", 1) so limits apply per real client IP.
const router = express.Router();

// Counts every attempt - caps raw request volume.
const createBurstLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this network. If this is an emergency, call 112." },
});

// Counts only successful creations. A failed validation (a mistyped phone
// number) must not use up a panicking person's allowance.
const createSuccessLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.PUBLIC_REQUESTS_PER_HOUR) || 5,
  skipFailedRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this network. If this is an emergency, call 112." },
});

// A patient page polling every ~5s uses about 12 per minute.
const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment." },
});

router.post("/requests", createBurstLimiter, createSuccessLimiter, createRequest);
router.get("/track", trackLimiter, trackRequest);

export default router;