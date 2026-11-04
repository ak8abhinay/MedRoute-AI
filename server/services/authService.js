import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

// Tokens are bound to staff use. Any future credential type (e.g. patient
// tracking) must not be a JWT signed with this secret and audience.
const TOKEN_AUDIENCE = "medroute-staff";
const STAFF_ROLES = ["admin", "dispatcher"];

export const signToken = (user) =>
  jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    audience: TOKEN_AUDIENCE,
  });

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      audience: TOKEN_AUDIENCE,
      algorithms: ["HS256"],
    });
  } catch {
    return null;
  }
};

// Constant-time comparison, so response timing can't be used to guess the key.
export const verifyServiceKey = (key) => {
  const expected = process.env.SERVICE_API_KEY;
  if (!expected || !key) return false;
  const a = Buffer.from(String(key));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * The single place credentials are interpreted - used by both the HTTP
 * middleware and (in 1b) the Socket.IO handshake. Returns { id, role } or null.
 */
export const resolveIdentity = ({ bearerToken, apiKey }) => {
  if (bearerToken) {
    const payload = verifyToken(bearerToken);
    if (payload && STAFF_ROLES.includes(payload.role)) {
      return { id: payload.id, role: payload.role };
    }
  }
  if (apiKey && verifyServiceKey(apiKey)) return { id: "service", role: "service" };
  return null;
};