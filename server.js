// Import required packages
import express from 'express';          // Web framework
import dotenv from 'dotenv';            // Environment variable management
import cors from 'cors';                // Enable Cross-Origin Resource Sharing
import bodyParser from 'body-parser';   // Parse incoming request bodies
import Razorpay from 'razorpay';        // Razorpay payment gateway
import crypto from 'crypto';            // Node.js crypto module for signature verification
import multer from 'multer';            // Handle file uploads
import mongoose from 'mongoose';        // MongoDB object modeling
import Payment from './models/Payment.js'; // Mongoose model for payments

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();

// ----------------- Middleware -----------------

// CORS configuration to allow requests from any origin
const corsOptions = {
  origin: "*",                     // Allow all origins (change for production)
  methods: "GET, POST, PUT, DELETE, PATCH, HEAD", // Allowed HTTP methods
  credentials: true,               // Allow credentials (cookies, auth headers)
};
app.use(cors(corsOptions));

// Parse JSON bodies
app.use(bodyParser.json());

// ----------------- Razorpay Setup -----------------

// Initialize Razorpay instance using credentials from environment variables
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ----------------- Routes -----------------

// Test route to check if backend is running
app.get('/', (req, res) => {
  res.send('Aura Jyotish Kendra Backend is running!');
});

// Create a new Razorpay order
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount } = req.body;

    // Create order with amount in paise (amount * 100)
    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: 'INR',
      receipt: 'rcpt_' + Date.now() // Unique receipt ID
    });

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Verify Razorpay payment signature to ensure authenticity
app.post('/api/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Generate HMAC hash with secret
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');

    // Compare generated signature with received signature
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

// Configure memory storage for multer (uploads are kept in memory)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Handle Kundli file uploads
app.post("/api/upload-kundli", upload.single("kundli"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) return res.status(400).send("No file uploaded");

    // Acknowledge upload without sending email
    res.json({ success: true, message: "Upload received. Emailing disabled." });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

// ----------------- MongoDB Connection -----------------

// Connect to MongoDB using MONGO_URI environment variable
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,          // Use new URL parser
  useUnifiedTopology: true,       // Use new Server Discover and Monitoring engine
})
.then(() => console.log('MongoDB connected'))   // Connection successful
.catch(err => console.error('MongoDB connection error:', err)); // Connection failed

// ----------------- Payment Saving -----------------

// Save payment and user details to MongoDB
app.post('/api/save-payment', async (req, res) => {
  try {
    const {
      fullName, email, phone, dob, birthTime,
      country, state, city, amount, orderId, paymentId
    } = req.body;

    // Basic validation: required fields
    if (!fullName || !email || !amount || !dob) {
      return res.status(400).json({ success: false, error: 'fullName, email, amount, and dob are required' });
    }

    // Create and save document in MongoDB
    const doc = await Payment.create({
      fullName, email, phone, dob, birthTime,
      country, state, city, amount, orderId, paymentId
    });

    // Return success response with saved document ID
    res.status(201).json({ success: true, id: doc._id });
  } catch (err) {
    console.error('Failed to save payment:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ----------------- Start Server -----------------

const PORT = process.env.PORT || 4000; // Use environment PORT or fallback
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
