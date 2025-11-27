import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema(
  {
    // User details (duplicates allowed; no unique constraints)
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    dob: { type: String, required: true },
    birthTime: { type: String },
    country: { type: String },
    state: { type: String },
    city: { type: String },

    // Payment amounts and identifiers
    amount: { type: Number, required: true },
    orderId: { type: String },
    paymentId: { type: String },

    // Payment status and confirmation details
    status: { type: String, default: "confirmed" }, // e.g., pending | confirmed | failed
    referenceNumber: { type: String },
    paymentConfirmedAt: { type: Date },
  },
  { timestamps: true }
);

// Expose a friendly `id` in JSON alongside Mongo `_id`
PaymentSchema.virtual("id").get(function () {
  return this._id.toString();
});
PaymentSchema.set("toJSON", { virtuals: true });

export const Payment = mongoose.model("Payment", PaymentSchema);