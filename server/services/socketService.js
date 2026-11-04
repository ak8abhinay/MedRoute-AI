import { Server } from "socket.io";
import { resolveIdentity } from "./authService.js";

let io = null;

// The live feed is an unfiltered broadcast (io.emit) of every ambulance
// position and emergency event. Only staff and the simulator may join it.
// Anyone else needing live data must use a scoped REST endpoint instead.
const LIVE_FEED_ROLES = ["admin", "dispatcher", "service"];

export const initializeSocket = (httpServer, options = {}) => {
  io = new Server(httpServer, {
    cors: { origin: options.corsOrigin || "*" },
  });

  // Checked once, at connection time. Clients send { token } (a logged-in
  // user) or { apiKey } (the simulator) in the handshake.
  io.use((socket, next) => {
    const { token, apiKey } = socket.handshake.auth || {};
    const identity = resolveIdentity({ bearerToken: token, apiKey });
    if (!identity || !LIVE_FEED_ROLES.includes(identity.role)) {
      return next(new Error("Authentication required."));
    }
    socket.data.user = identity;
    next();
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id} (${socket.data.user.role})`);
    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Returns the active Socket.IO server instance, or null if
 * initializeSocket() hasn't run yet.
 */
export const getIO = () => io;