import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
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

// Razorpay integration removed; keeping only QR-based flow

// Environment-driven UPI details for QR payments (sanitize env values)
const sanitize = (val, fallback = "") => {
  if (!val || typeof val !== "string") return fallback;
  const trimmed = val.trim();
  // Strip leading/trailing quotes if present
  return trimmed.replace(/^['"]|['"]$/g, "");
};
const UPI_VPA = sanitize(process.env.UPI_VPA, "6205586065@ybl");
const UPI_PAYEE_NAME = sanitize(process.env.UPI_PAYEE_NAME, "Aura Jyotish Kendra");
// Secret for QR verification token
const QR_SECRET = process.env.QR_SECRET || "default_qr_secret";

// Create a QR-based order without Razorpay; returns a secure token and QR payload
app.post("/api/create-qr-order", async (req, res) => {
  try {
    const { amount, note, payerName } = req.body;
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "Valid amount (>0) is required" });
    }

    // Validate UPI VPA to prevent invalid QR payloads (pa=undefined)
    const isValidVpa = (vpa) => typeof vpa === "string" && /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(vpa);
    if (!isValidVpa(UPI_VPA)) {
      console.error("Invalid or missing UPI_VPA:", UPI_VPA);
      return res.status(500).json({ error: "UPI VPA is not configured correctly" });
    }

    const normalizedAmount = Number(amount);
    // Unique order id similar to a receipt format
    const orderId = `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Token to validate subsequent save-payment calls
    const hmac = crypto.createHmac("sha256", QR_SECRET);
    hmac.update(`${orderId}|${normalizedAmount}`);
    const verificationToken = hmac.digest("hex");

    // UPI QR value (Android/iOS payment apps can read this)
    const payeeName = (UPI_PAYEE_NAME && UPI_PAYEE_NAME.trim()) ? UPI_PAYEE_NAME.trim() : "Aura Jyotish Kendra";
    const txnNote = (note || "Astrology Consultation").slice(0, 60);
    // Include orderId in transaction reference for reconciliation
    const tr = orderId;
    const qrValue = `upi://pay?pa=${encodeURIComponent(UPI_VPA)}&pn=${encodeURIComponent(payeeName)}&am=${encodeURIComponent(normalizedAmount)}&cu=INR&tn=${encodeURIComponent(txnNote)}&tr=${encodeURIComponent(tr)}`;

    res.json({ orderId, amount: normalizedAmount, verificationToken, qrValue });
  } catch (error) {
    console.error("Error creating QR order:", error);
    res.status(500).json({ error: "Failed to create QR order" });
  }
});

// Razorpay routes removed: /api/create-order and /api/verify

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
      verificationToken,
    } = req.body;

    if (!fullName || !email || !dob || !amount || Number(amount) <= 0) {
      return res.status(400).json({ error: "fullName, email, dob, and valid amount (>0) are required" });
    }

    // If a verificationToken is supplied (QR flow), validate it
    if (verificationToken) {
      try {
        const normalizedAmount = Number(amount);
        const hmac = crypto.createHmac("sha256", QR_SECRET);
        hmac.update(`${orderId}|${normalizedAmount}`);
        const expected = hmac.digest("hex");
        if (expected !== verificationToken) {
          return res.status(400).json({ error: "Invalid verification token" });
        }
      } catch (err) {
        console.error("QR token verification error:", err);
        return res.status(500).json({ error: "Failed to verify QR token" });
      }
    }

    // Ensure DB connection is active before attempting to save
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
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

// Confirm payment by saving reference number and timestamp on user document
app.post("/api/users/confirm-payment", async (req, res) => {
  try {
    const {
      email,
      referenceNumber,
      amount,
      orderId,
      verificationToken,
      // optional fields to set only on insert
      fullName,
      phone,
      dob,
      birthTime,
      country,
      state,
      city,
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }
    if (!referenceNumber || String(referenceNumber).trim().length === 0) {
      return res.status(400).json({ error: "referenceNumber is required" });
    }

    // If a verificationToken is supplied (QR flow), validate it
    if (verificationToken) {
      try {
        const normalizedAmount = Number(amount || 0);
        if (!orderId || !normalizedAmount) {
          return res.status(400).json({ error: "orderId and amount are required when verificationToken is provided" });
        }
        const hmac = crypto.createHmac("sha256", QR_SECRET);
        hmac.update(`${orderId}|${normalizedAmount}`);
        const expected = hmac.digest("hex");
        if (expected !== verificationToken) {
          return res.status(400).json({ error: "Invalid verification token" });
        }
      } catch (err) {
        console.error("QR token verification error:", err);
        return res.status(500).json({ error: "Failed to verify QR token" });
      }
    }

    // Ensure DB connection is active
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database not connected" });
    }

    // Insert a NEW payment document per confirmation (no upsert)
    const now = new Date();
    const payment = new Payment({
      fullName,
      email,
      phone,
      dob,
      birthTime,
      country,
      state,
      city,
      amount: amount ? Number(amount) : undefined,
      orderId,
      referenceNumber: String(referenceNumber).trim(),
      paymentConfirmedAt: now,
      status: "confirmed",
    });

    await payment.save();
    res.json({ success: true, message: "Payment confirmed", paymentId: payment._id, paymentConfirmedAt: payment.paymentConfirmedAt });
  } catch (error) {
    console.error("Error confirming payment:", error);
    res.status(500).json({ error: "Failed to confirm payment" });
  }
});

const PORT = process.env.PORT || 5080;
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

(async () => {
  try {
    if (mongoUri) {
      await mongoose.connect(mongoUri);
      console.log("Connected to MongoDB");
    } else {
      console.warn("MongoDB URI not set; starting server without DB connection.");
    }
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();
