import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/user.js";

const { ADMIN_NAME = "Admin", ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

const run = async () => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (and optionally ADMIN_NAME) when running this script.");
  }
  if (ADMIN_PASSWORD.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters.");

  await mongoose.connect(process.env.MONGO_URI);

  const email = ADMIN_EMAIL.toLowerCase().trim();
  const existing = await User.findOne({ email });

  if (existing) {
    console.log(`User ${email} already exists (role: ${existing.role}). Nothing changed.`);
  } else {
    await User.create({
      name: ADMIN_NAME,
      email,
      password: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: "admin",
    });
    console.log(`Admin created: ${email}`);
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});