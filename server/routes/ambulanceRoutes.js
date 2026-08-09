import express from "express";
import {
  getAmbulances,
  getAmbulanceById,
  addAmbulance,
  updateAmbulance,
  removeAmbulance,
  assignCrew,
} from "../controllers/ambulanceController.js";

const router = express.Router();

// Order matters here: /assign-crew must be registered before /:id, or
// Express would try to match "assign-crew" as an :id param on a GET/PUT
// route instead of hitting this dedicated route. Not an issue between
// these two specifically since assign-crew is POST-only and the others
// are GET/PUT - but it's the right habit for when auth middleware or
// more specific routes get added later.
router.get("/", getAmbulances);
router.get("/:id", getAmbulanceById);
router.post("/", addAmbulance);
router.put("/:id", updateAmbulance);
router.delete("/:id", removeAmbulance);
router.post("/assign-crew", assignCrew);

export default router;