// Matches the real enum values from ambulanceService.js / emergencyStatus.js
// exactly - not an approximation, the literal status strings the backend emits.
export const ambulanceColor = (status) =>
  ({
    available: "#22c55e",
    dispatched: "#f59e0b",
    onRoute: "#3b82f6",
    working: "#ef4444",
    transporting: "#a855f7",
    idle: "#9ca3af",
  }[status] || "#6b7280");

export const emergencyColor = (severity) =>
  ({
    High: "#dc2626",
    Medium: "#f59e0b",
    Low: "#eab308",
  }[severity] || "#6b7280");