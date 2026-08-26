import "dotenv/config";
import { FleetManager } from "./fleetManager.js";

const fleetManager = new FleetManager();

fleetManager.start().catch((err) => {
  console.error("[simulator] Fatal startup error:", err);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\n[simulator] Shutting down.");
  process.exit(0);
});