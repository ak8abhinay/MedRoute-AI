import mongoose from "mongoose";
import Ambulance from "../models/ambulance.js";
import MedicalCrew from "../models/medicalCrew.js";
import GPS from "../models/gps.js";
import { getIO } from "../services/socketService.js";
import logger from "../services/logger.js";
import { updateAmbulanceStatus } from "../services/ambulanceService.js";

/**
 * GET /api/ambulances
 * Returns all ambulances joined with their most recent GPS position
 * (latitude, longitude, speed, timestamp) via aggregation, so the
 * dashboard/map can render live positions without a separate GPS
 * query per ambulance.
 */
export const getAmbulances = async (_req, res) => {
  try {
    const gpsCollectionName = GPS.collection.name;

    const ambulances = await Ambulance.aggregate([
      {
        $lookup: {
          from: gpsCollectionName,
          let: { ambulanceId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$ambulance", "$$ambulanceId"] } } },
            { $sort: { timestamp: -1 } },
            { $limit: 1 },
            { $project: { latitude: 1, longitude: 1, speed: 1, timestamp: 1 } },
          ],
          as: "latestGPS",
        },
      },
      {
        $addFields: {
          latitude: { $arrayElemAt: ["$latestGPS.latitude", 0] },
          longitude: { $arrayElemAt: ["$latestGPS.longitude", 0] },
          speed: { $arrayElemAt: ["$latestGPS.speed", 0] },
          gpsTimestamp: { $arrayElemAt: ["$latestGPS.timestamp", 0] },
        },
      },
      { $project: { latestGPS: 0 } },
    ]);

    res.json(ambulances);
  } catch (e) {
    logger.error("Failed to fetch ambulances", { error: e.message });
    res.status(500).json({ error: e.message });
  }
};

/**
 * GET /api/ambulances/:id
 * Returns a single ambulance by ID with its assigned crew populated.
 * Responds 404 if no ambulance exists with that ID.
 */
export const getAmbulanceById = async (req, res) => {
  try {
    const ambulance = await Ambulance.findById(req.params.id).populate("assigned_crew");
    if (!ambulance) {
      return res.status(404).json({ error: "Ambulance not found" });
    }
    res.json(ambulance);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * POST /api/ambulances
 * Creates a new ambulance record. If ambulance_number already exists
 * (Mongo duplicate key error, code E11000), responds 400 with a
 * friendly message instead of the raw driver error.
 */
export const addAmbulance = async (req, res) => {
  try {
    const ambulance = await Ambulance.create(req.body);
    logger.info("Ambulance created", { ambulanceId: ambulance._id.toString() });
    res.status(201).json(ambulance);
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).json({ error: "Ambulance number already exists." });
    }
    res.status(400).json({ error: e.message });
  }
};

/**
 * PUT /api/ambulances/:id
 * Updates an ambulance. If the request includes `status`, the update is
 * routed through ambulanceService.updateAmbulanceStatus, which validates
 * the transition against the allowed state machine and emits
 * `ambulance:status-change` on success. Non-status field edits (e.g.
 * correcting ambulance_number) go through a plain update with no
 * transition check. Always emits `ambulance:update` on success either way.
 */
export const updateAmbulance = async (req, res) => {
  try {
    const { status, ...otherFields } = req.body;
    let ambulance;

    if (status) {
      try {
        ambulance = await updateAmbulanceStatus(req.params.id, status, otherFields);
      } catch (err) {
        return res.status(err.statusCode || 400).json({ error: err.message });
      }
    } else {
      ambulance = await Ambulance.findByIdAndUpdate(req.params.id, { ambulance_number }, { new: true });
      if (!ambulance) {
        return res.status(404).json({ error: "Ambulance not found" });
      }
    }

    logger.info("Ambulance updated", {
      ambulanceId: ambulance._id.toString(),
      updatedFields: req.body,
    });

    const io = getIO();
    if (io) {
      io.emit("ambulance:update", {
        ambulanceId: ambulance._id.toString(),
        ambulance,
        updatedFields: req.body,
      });
    }

    res.json(ambulance);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * DELETE /api/ambulances/:id
 * Deletes an ambulance by ID. Responds 404 if it doesn't exist.
 */
export const removeAmbulance = async (req, res) => {
  try {
    const ambulance = await Ambulance.findByIdAndDelete(req.params.id);
    if (!ambulance) {
      return res.status(404).json({ error: "Ambulance not found" });
    }
    logger.info("Ambulance removed", { ambulanceId: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

/**
 * POST /api/ambulances/assign-crew
 * Assigns a medical crew to an ambulance and the ambulance to the crew,
 * inside a single MongoDB transaction so both sides stay in sync even
 * if one write fails partway through. Validates, in order: ambulance
 * exists, crew exists, crew isn't already on a different ambulance,
 * ambulance doesn't already have a different crew. Emits
 * `ambulance:crew-assigned` on success.
 */
export const assignCrew = async (req, res) => {
  const { ambulanceId, crewId } = req.body;
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const ambulance = await Ambulance.findById(ambulanceId).session(session);
      if (!ambulance) {
        const err = new Error("Ambulance not found");
        err.statusCode = 404;
        throw err;
      }

      const crew = await MedicalCrew.findById(crewId).session(session);
      if (!crew) {
        const err = new Error("Crew not found");
        err.statusCode = 404;
        throw err;
      }

      if (crew.assigned_ambulance && crew.assigned_ambulance.toString() !== ambulanceId) {
        const err = new Error("Crew is already assigned to another ambulance.");
        err.statusCode = 400;
        throw err;
      }

      if (ambulance.assigned_crew && ambulance.assigned_crew.toString() !== crewId) {
        const err = new Error("Ambulance already has a crew assigned.");
        err.statusCode = 400;
        throw err;
      }

      await Ambulance.findByIdAndUpdate(ambulanceId, { assigned_crew: crewId }, { session });
      await MedicalCrew.findByIdAndUpdate(crewId, { assigned_ambulance: ambulanceId }, { session });

      result = await Ambulance.findById(ambulanceId).populate("assigned_crew").session(session);
    });

    logger.info("Crew assigned to ambulance", { ambulanceId, crewId });

    const io = getIO();
    if (io) {
      io.emit("ambulance:crew-assigned", { ambulanceId, crewId });
    }

    res.json(result);
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.message });
  } finally {
    await session.endSession();
  }
};