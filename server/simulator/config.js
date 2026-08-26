export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
export const SOCKET_URL = process.env.SOCKET_URL || "http://localhost:5000";

// 1x, 5x, 10x - how many route waypoints to advance per tick. Not a
// literal speed unit, just a multiplier on movement rate.
export const SPEED_MULTIPLIER = Number(process.env.SIMULATOR_SPEED_MULTIPLIER) || 5;

export const TICK_INTERVAL_MS = Number(process.env.SIMULATOR_TICK_INTERVAL_MS) || 3000;
export const REFRESH_INTERVAL_MS = Number(process.env.SIMULATOR_REFRESH_INTERVAL_MS) || 10000;
export const ASSUMED_SPEED_KMH = 40; // for the "speed" field on GPS posts, display only