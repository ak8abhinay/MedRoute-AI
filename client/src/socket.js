import { io } from "socket.io-client";
import { getToken } from "./auth";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

// autoConnect:false - the dashboard connects after login and disconnects
// on logout. `auth` is a function, so every (re)connection attempt reads
// the CURRENT token, not whatever it was when this module first loaded.
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ["websocket"],
  auth: (cb) => cb({ token: getToken() }),
});