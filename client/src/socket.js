import { io } from "socket.io-client";

let socket = null;

/**
 * Connects to the Socket.IO server.
 * Returns the active socket instance.
 */
export const connectSocket = () => {
  if (!socket) {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
    socket = io(backendUrl, {
      transports: ["websocket"], // force WebSocket for reliability
      reconnectionAttempts: 5,   // try 5 times on connection failure
      reconnectionDelay: 2000,   // wait 2s between attempts
    });

    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
    });

    socket.on("disconnect", (reason) => {
      console.warn("⚠️ Socket disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      console.error("⚠️ Socket connection error:", err.message);
    });
  }

  return socket;
};

/**
 * Returns the active socket instance.
 * Throws an error if socket is not yet connected.
 */
export const getSocket = () => {
  if (!socket) {
    throw new Error("Socket not connected. Call connectSocket() first.");
  }
  return socket;
};
