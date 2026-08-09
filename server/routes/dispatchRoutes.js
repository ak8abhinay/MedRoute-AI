import express from "express";
import { dispatch } from "../controllers/dispatchController.js";

const router = express.Router();

router.post("/:emergencyId", dispatch);

export default router;