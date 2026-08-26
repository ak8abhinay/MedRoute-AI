import { io } from "socket.io-client";
import { SOCKET_URL } from "./config.js";

/**
 * Thin wrapper around the Socket.IO client connection. FleetManager
 * registers the specific event handlers it cares about - this file only
 * owns the connection itself.
 */
export const createSocketClient = () => {
  const socket = io(SOCKET_URL, { transports: ["websocket"] });

  socket.on("connect", () => console.log(`[socket] Connected (${socket.id})`));
  socket.on("disconnect", (reason) => console.log(`[socket] Disconnected: ${reason}`));
  socket.on("connect_error", (err) => console.error(`[socket] Connection error: ${err.message}`));

  return socket;
};