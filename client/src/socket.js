import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

export const socket = io(SOCKET_URL, { transports: ["websocket"] });

socket.on("connect", () => console.log("[socket] connected", socket.id));
socket.on("disconnect", (reason) => console.log("[socket] disconnected:", reason));