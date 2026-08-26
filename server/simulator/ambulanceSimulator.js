import { postGpsUpdate } from "./gpsUpdater.js";
import { getRoute } from "../services/routingService.js";
import { TICK_INTERVAL_MS, SPEED_MULTIPLIER, ASSUMED_SPEED_KMH, BACKEND_URL } from "./config.js";

export const SimState = {
  DRIVING_TO_SCENE: "DRIVING_TO_SCENE",
  AT_SCENE: "AT_SCENE",
  DRIVING_TO_HOSPITAL: "DRIVING_TO_HOSPITAL",
  COMPLETED: "COMPLETED",
};

/**
 * Drives ONE ambulance through its lifecycle. Requests routes, posts
 * GPS, and reacts to backend-emitted events - never decides anything
 * about arrival or case progress on its own. Destination coordinates
 * always come from a real GET to the backend, never invented.
 */
export class AmbulanceSimulator {
  constructor(ambulanceId, startLat, startLng, onComplete) {
    this.ambulanceId = ambulanceId;
    this.lat = startLat;
    this.lng = startLng;
    this.emergencyId = null;
    this.state = null;
    this.route = null;
    this.routeIndex = 0;
    this.tickHandle = null;
    this.onComplete = onComplete; // callback into FleetManager
  }

  /** Called by FleetManager on a fresh "emergency:dispatched" event. */
  async start(emergencyId) {
    this.emergencyId = emergencyId;
    const emergency = await this._fetchEmergency(emergencyId);
    if (!emergency) {
      console.warn(`[sim ${this.ambulanceId}] Could not fetch emergency ${emergencyId} - aborting.`);
      this._complete();
      return;
    }
    await this._beginLeg(SimState.DRIVING_TO_SCENE, emergency.latitude, emergency.longitude);
  }

  /**
   * Called by FleetManager during recovery, for an ambulance that was
   * already mid-dispatch when this simulator process started (or whose
   * in-memory instance was lost). Resumes from whatever phase the
   * backend's current status actually reflects, rather than starting
   * the sequence over.
   */
  async resume(emergency, currentStatus) {
    this.emergencyId = emergency._id;
    if (currentStatus === "dispatched" || currentStatus === "onRoute") {
      await this._beginLeg(SimState.DRIVING_TO_SCENE, emergency.latitude, emergency.longitude);
    } else if (currentStatus === "working") {
      this.state = SimState.AT_SCENE;
      console.log(`[sim ${this.ambulanceId}] Resumed at scene, waiting for backend.`);
    } else if (currentStatus === "transporting" && emergency.assigned_hospital) {
      await this._beginLeg(
        SimState.DRIVING_TO_HOSPITAL,
        emergency.assigned_hospital.latitude,
        emergency.assigned_hospital.longitude
      );
    } else {
      console.warn(`[sim ${this.ambulanceId}] Could not determine resume phase for status "${currentStatus}"`);
    }
  }

  /**
   * The single reaction point to backend truth - everything the
   * simulator does after start() is triggered from here, driven by
   * real ambulance:status-change events, never assumed locally.
   */
  async onStatusChange(status) {
    if (status === "working" && this.state === SimState.DRIVING_TO_SCENE) {
      this._stopDriving();
      this.state = SimState.AT_SCENE;
      console.log(`[sim ${this.ambulanceId}] Backend confirmed arrival at scene.`);
    } else if (status === "transporting") {
      const emergency = await this._fetchEmergency(this.emergencyId);
      if (emergency?.assigned_hospital) {
        await this._beginLeg(
          SimState.DRIVING_TO_HOSPITAL,
          emergency.assigned_hospital.latitude,
          emergency.assigned_hospital.longitude
        );
      } else {
        console.warn(`[sim ${this.ambulanceId}] Status is "transporting" but no hospital found - cannot proceed.`);
      }
    } else if (status === "available" && this.state !== SimState.COMPLETED) {
      this._stopDriving();
      this._complete();
    }
  }

  async _beginLeg(state, destLat, destLng) {
    this.state = state;
    console.log(`[sim ${this.ambulanceId}] Requesting route for ${state}...`);

    const route = await getRoute(this.lat, this.lng, destLat, destLng);
    this.route =
      route.waypoints?.length > 1
        ? route.waypoints
        : [
            { latitude: this.lat, longitude: this.lng },
            { latitude: destLat, longitude: destLng },
          ];
    this.routeIndex = 0;

    console.log(`[sim ${this.ambulanceId}] Route ready (${route.source}, ${this.route.length} points) - driving.`);

    this._stopDriving();
    this.tickHandle = setInterval(() => this._tick(), TICK_INTERVAL_MS);
  }

  async _tick() {
    if (!this.route || this.routeIndex >= this.route.length - 1) {
      // Reached the end of our planned route. We do NOT assume arrival
      // ourselves - stop moving and wait for the backend to confirm via
      // its own proximity check.
      this._stopDriving();
      console.log(`[sim ${this.ambulanceId}] Reached route end, waiting for backend confirmation.`);
      return;
    }

    const step = Math.max(1, Math.round(SPEED_MULTIPLIER));
    this.routeIndex = Math.min(this.routeIndex + step, this.route.length - 1);

    const point = this.route[this.routeIndex];
    this.lat = point.latitude;
    this.lng = point.longitude;

    await postGpsUpdate(this.ambulanceId, this.lat, this.lng, ASSUMED_SPEED_KMH * SPEED_MULTIPLIER);
  }

  _stopDriving() {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  _complete() {
    this.state = SimState.COMPLETED;
    console.log(`[sim ${this.ambulanceId}] Cycle complete - returning to idle pool.`);
    this.onComplete(this.ambulanceId, this.lat, this.lng);
  }

  async _fetchEmergency(emergencyId) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/emergencies/${emergencyId}`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }
}