import bcrypt from "bcryptjs";
import User from "../models/user.js";
import { signToken } from "../services/authService.js";
import logger from "../services/logger.js";

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["admin", "dispatcher"];

// Compared against when the email doesn't exist, so "unknown email" and
// "wrong password" take similar time and return the identical message.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

const publicUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
});

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Strings only. Without this, a body like {"email": {"$gt": ""}} would
    // reach the Mongo query as an operator (NoSQL injection).
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalized = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalized }).select("+password");
    const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

    if (!user || !ok) {
      logger.warn("Failed login attempt", { email: normalized });
      return res.status(401).json({ error: "Invalid email or password." });
    }

    logger.info("User logged in", { userId: user._id.toString(), role: user.role });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: "Account no longer exists." });
    res.json({ user: publicUser(user) });
  } catch {
    res.status(401).json({ error: "Invalid session." });
  }
};

// Admin-only (enforced in the route). Fields are validated one by one, not
// spread from req.body - same whitelist rule as the rest of the backend.
export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required." });
    }
    if (typeof email !== "string" || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: "A valid email is required." });
    }
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    const finalRole = role ?? "dispatcher";
    if (!ROLES.includes(finalRole)) {
      return res.status(400).json({ error: `Role must be one of: ${ROLES.join(", ")}.` });
    }

    const user = await User.create({
      name: name.trim(),
      email,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role: finalRole,
    });

    logger.info("User created", { userId: user._id.toString(), role: finalRole, createdBy: req.user.id });
    res.status(201).json({ user: publicUser(user) });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: "A user with that email already exists." });
    res.status(500).json({ error: e.message });
  }
};