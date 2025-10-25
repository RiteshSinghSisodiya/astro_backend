// Import required packages
import express from 'express';          
import dotenv from 'dotenv';            
import cors from 'cors';                
import bodyParser from 'body-parser';   
import Razorpay from 'razorpay';        
import crypto from 'crypto';            
import multer from 'multer';            
import mongoose from 'mongoose';        
import Payment from './models/Payment.js'; 

// ----------------- Load Environment Variables -----------------
dotenv.config(); // must be before using process.env

// ----------------- Initialize Express -----------------
const app = express();

// ----------------- Middleware -----------------
const corsOptions = {
  origin: "*",
  methods: "GET, POST, PUT, DELETE, PATCH, HEAD",
  credentials: true,
};
app.use(cors(corsOptions));
app.use(bodyParser.json());

// ----------------- Razorpay Setup -----------------
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ----------------- Routes -----------------
app.get('/', (req, res) => {
  res.send('Aura Jyotish Kendra Backend is running!');
});

app.post('/api/create-order', async (req, res) => {
  try {
    const { amount } = req.body;
    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: 'INR',
      receipt: 'rcpt_' + Date.now()
    });
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.post('/api/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, msg: 'Invalid signature' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
});

// ----------------- File Upload -----------------
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.post("/api/upload-kundli", upload.single("kundli"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).send("No file uploaded");
    res.json({ success: true, message: "Upload received. Emailing disabled." });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

// ----------------- MongoDB Connection -----------------
// Connection handled during startup after environment validation.

// ----------------- Save Payment -----------------
app.post('/api/save-payment', async (req, res) => {
  try {
    const {
      fullName, email, phone, dob, birthTime,
      country, state, city, amount, orderId, paymentId
    } = req.body;

    if (!fullName || !email || !amount || !dob) {
      return res.status(400).json({ success: false, error: 'fullName, email, amount, and dob are required' });
    }

    const doc = await Payment.create({
      fullName, email, phone, dob, birthTime,
      country, state, city, amount, orderId, paymentId
    });

    res.status(201).json({ success: true, id: doc._id });
  } catch (err) {
    console.error('Failed to save payment:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ----------------- Start Server -----------------
const PORT = process.env.PORT || 4000;

// MongoDB connection using MONGO_URI (fallback to MONGODB_URI)
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
(async () => {
  try {
    if (!MONGO_URI) {
      throw new Error('MONGO_URI is not defined. Please set it in .env or Render environment variables.');
    }
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    });
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log('Backend running on port', PORT));
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
})();
