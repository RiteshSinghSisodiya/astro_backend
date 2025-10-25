import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  dob: { type: String, required: true },
  birthTime: { type: String },
  country: { type: String },
  state: { type: String },
  city: { type: String },
  amount: { type: Number, required: true },
  orderId: { type: String },
  paymentId: { type: String },
});

export const Payment = mongoose.model("Payment", PaymentSchema);