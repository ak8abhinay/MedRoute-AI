import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    emergency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Emergency", 
      required: true,
    },
    ambulance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ambulance",
      required: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      required: true,
    },

    solved: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Alert", alertSchema);