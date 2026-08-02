import { Server } from "socket.io";

let io = null;

// Initializes the shared Socket.IO server instance.


export const initializeSocket = (httpServer, options = {}) => {
  io = new Server(httpServer, {
    cors: { origin: options.corsOrigin || "*" },
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);
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