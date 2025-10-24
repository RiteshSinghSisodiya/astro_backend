import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import bodyParser from 'body-parser'
import Razorpay from 'razorpay'
import crypto from 'crypto'

import fs from "fs";
import multer from "multer";
import mongoose from 'mongoose'
import Payment from './models/Payment.js'

dotenv.config()

const app = express()

const corsOptions = {
  origin: "*",
  methods: "GET, POST, PUT, DELETE, PATCH, HEAD",
  credentials: true,
};

app.use(cors(corsOptions));
app.use(bodyParser.json())

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
})

app.get('/', (req, res) => {
  res.send('Aura jyotish kendra Backend is running!')
})

// Create Razorpay order
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount } = req.body
    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: 'INR',
      receipt: 'rcpt_' + Date.now()
    })
    res.json(order)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to create order' })
  }
})

// Verify signature and send emails
app.post('/api/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, formData } = req.body
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id)
    const generated_signature = hmac.digest('hex')

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, msg: 'Invalid signature' })
    }

    res.json({ success: true })

  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, msg: 'Server error' })
  }
})

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post("/api/upload-kundli", upload.single("kundli"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).send("No file uploaded");
    }

    // Mailing disabled; acknowledge upload without sending email
    res.json({ success: true, message: "Upload received. Emailing disabled." });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log('Backend running on port', PORT))

// MongoDB connection
const buildMongoUri = () => {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI
  const { MONGODB_USERNAME, MONGODB_PASSWORD, MONGODB_HOST, MONGODB_DBNAME } = process.env
  if (MONGODB_USERNAME && MONGODB_PASSWORD && MONGODB_HOST) {
    const encodedPass = encodeURIComponent(MONGODB_PASSWORD)
    const db = MONGODB_DBNAME || 'astrodb'
    return `mongodb+srv://${MONGODB_USERNAME}:${encodedPass}@${MONGODB_HOST}/${db}?retryWrites=true&w=majority&appName=Cluster0`
  }
  return null
}

const mongoUri = buildMongoUri()
if (!mongoUri) {
  console.error('MongoDB configuration missing: set MONGODB_URI or MONGODB_USERNAME/MONGODB_PASSWORD/MONGODB_HOST')
} else {
  mongoose
    .connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    })
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.error('MongoDB connection error:', err))
}

// Save payment details to MongoDB
app.post('/api/save-payment', async (req, res) => {
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
    } = req.body

    // Basic validation (relaxed: allow missing dob)
    if (!fullName || !email || !amount) {
      return res.status(400).json({
        success: false,
        error: 'fullName, email, and amount are required',
      })
    }

    const doc = await Payment.create({
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
    })

    return res.status(201).json({ success: true, id: doc._id })
  } catch (err) {
    console.error('Failed to save payment:', err)
    return res.status(500).json({ success: false, error: 'Server error' })
  }
})
