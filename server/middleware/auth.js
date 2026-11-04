import { resolveIdentity } from "../services/authService.js";

export const STAFF = ["admin", "dispatcher"];
export const STAFF_OR_SERVICE = ["admin", "dispatcher", "service"];

export const authenticate = (req, res, next) => {
  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const apiKey = req.headers["x-api-key"] || null;

  const identity = resolveIdentity({ bearerToken, apiKey });
  if (!identity) return res.status(401).json({ error: "Authentication required." });

  req.user = identity;
  next();
};

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }
    next();
  };