import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select:false - never returned by default queries, so a password hash
    // can't leak through an accidental res.json(user). Login opts in
    // explicitly with .select("+password").
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "dispatcher"], default: "dispatcher" },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);