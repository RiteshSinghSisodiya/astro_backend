import mongoose from 'mongoose'

const PaymentSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    dob: { type: String }, // optional; store as ISO/date string from form
    birthTime: { type: String },
    country: { type: String },
    state: { type: String },
    city: { type: String },

    amount: { type: Number, required: true },
    orderId: { type: String, trim: true },
    paymentId: { type: String, trim: true },
  },
  { timestamps: true }
)

export default mongoose.models.Payment || mongoose.model('Payment', PaymentSchema)