import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import Razorpay from "razorpay";
import crypto from "crypto";
import multer from "multer";
import mongoose from "mongoose";
import { Payment } from "./models/Payment.js";

dotenv.config();

const app = express();

const corsOptions = {
  origin: process.env.ALLOWED_ORIGIN || "*",
  methods: "GET, POST, PUT, DELETE, PATCH, HEAD",
  credentials: true,
};
app.use(cors(corsOptions));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("Astro backend is running.");
});

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.post("/api/create-order", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valid amount (>0) is required" });
    }

    const options = {
      amount: Number(amount) * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

app.post("/api/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const generated_signature = hmac.digest("hex");

    if (generated_signature === razorpay_signature) {
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: "Invalid signature" });
    }
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.post("/api/upload-kundli", upload.single("kundli"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    res.json({ success: true, message: "File uploaded successfully", filename: req.file.originalname });
  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

app.post("/api/save-payment", async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      dob,
      birthTime,
      country,
      state,
      city,
      amount,
      orderId,
      paymentId,
    } = req.body;

    if (!fullName || !email || !dob || !amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "fullName, email, dob, and valid amount (>0) are required" });
    }

    const payment = new Payment({
      fullName,
      email,
      phone,
      dob,
      birthTime,
      country,
      state,
      city,
      amount: Number(amount),
      orderId,
      paymentId,
    });

    await payment.save();
    res.json({ success: true, message: "Payment saved successfully", paymentId: payment._id });
  } catch (error) {
    console.error("Error saving payment:", error);
    res.status(500).json({ error: "Failed to save payment" });
  }
});

const PORT = process.env.PORT || 5080;
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("MongoDB URI is not set. Define MONGO_URI or MONGODB_URI in environment.");
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  }
})();
