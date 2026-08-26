import { createSocketClient } from "./socketClient.js";
import { AmbulanceSimulator } from "./ambulanceSimulator.js";
import { BACKEND_URL, REFRESH_INTERVAL_MS } from "./config.js";

// Backend statuses meaning "actively mid-dispatch" - used to adopt
// orphaned ambulances during periodic refresh.
const ACTIVE_STATUSES = ["dispatched", "onRoute", "working", "transporting"];

/**
 * Discovers and manages ambulances. Does NOT drive any of them - that's
 * each AmbulanceSimulator's job. Owns exactly two collections
 * (idleAmbulances, activeSimulations) so an ambulance can never be
 * simulated twice at once. Socket.IO is the primary trigger; periodic
 * REST refresh is purely a recovery mechanism for ambulances left
 * mid-dispatch from before this process started.
 */
export class FleetManager {
  constructor() {
    this.idleAmbulances = new Map();
    this.activeSimulations = new Map();
    this.socket = null;
  }

  async start() {
    console.log("[FleetManager] Starting...");
    await this._refresh();

    this.socket = createSocketClient();
    this.socket.on("emergency:dispatched", (payload) => this._handleDispatched(payload));
    this.socket.on("ambulance:status-change", (payload) => this._handleStatusChange(payload));

    setInterval(() => this._refresh(), REFRESH_INTERVAL_MS);
    console.log(`[FleetManager] Watching for dispatches. Refreshing every ${REFRESH_INTERVAL_MS}ms.`);
  }

  async _refresh() {
    let ambulances;
    try {
      const res = await fetch(`${BACKEND_URL}/api/ambulances`);
      ambulances = await res.json();
    } catch (err) {
      console.error("[FleetManager] Refresh failed:", err.message);
      return;
    }

    for (const ambulance of ambulances) {
      const id = ambulance._id;
      if (this.activeSimulations.has(id)) continue;

      if (ambulance.status === "available") {
        this.idleAmbulances.set(id, ambulance);
      } else if (ACTIVE_STATUSES.includes(ambulance.status)) {
        console.log(`[FleetManager] Adopting orphaned ambulance ${id} (status: ${ambulance.status})`);
        this._adopt(ambulance);
      }
    }
  }

  async _handleDispatched({ ambulanceId, emergencyId }) {
    if (this.activeSimulations.has(ambulanceId)) return;

    let known = this.idleAmbulances.get(ambulanceId);
    this.idleAmbulances.delete(ambulanceId);

    if (!known || known.latitude == null) {
      known = await this._fetchAmbulance(ambulanceId);
    }
    if (!known || known.latitude == null) {
      console.warn(`[FleetManager] No known position for ${ambulanceId} - cannot start simulation.`);
      return;
    }

    const sim = new AmbulanceSimulator(ambulanceId, known.latitude, known.longitude, (id, lat, lng) =>
      this._onSimComplete(id, lat, lng)
    );
    this.activeSimulations.set(ambulanceId, sim);
    console.log(`[FleetManager] New dispatch for ${ambulanceId} -> starting simulation.`);
    sim.start(emergencyId);
  }

  _handleStatusChange({ ambulanceId, status }) {
    const sim = this.activeSimulations.get(ambulanceId);
    if (sim) sim.onStatusChange(status);
  }

  async _adopt(ambulance) {
    const emergency = await this._findEmergencyForAmbulance(ambulance._id);
    if (!emergency) {
      console.warn(`[FleetManager] No active emergency found for orphaned ambulance ${ambulance._id}`);
      return;
    }

    const sim = new AmbulanceSimulator(ambulance._id, ambulance.latitude, ambulance.longitude, (id, lat, lng) =>
      this._onSimComplete(id, lat, lng)
    );
    this.activeSimulations.set(ambulance._id, sim);
    sim.resume(emergency, ambulance.status);
  }

  async _findEmergencyForAmbulance(ambulanceId) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/emergencies`);
      const emergencies = await res.json();
      return emergencies.find(
        (e) => e.assigned_ambulance?._id === ambulanceId || e.assigned_ambulance === ambulanceId
      );
    } catch {
      return null;
    }
  }

  async _fetchAmbulance(ambulanceId) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/ambulances/${ambulanceId}`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  _onSimComplete(ambulanceId, lat, lng) {
    this.activeSimulations.delete(ambulanceId);
    this.idleAmbulances.set(ambulanceId, { _id: ambulanceId, latitude: lat, longitude: lng, status: "available" });
    console.log(`[FleetManager] ${ambulanceId} returned to idle pool.`);
  }
}