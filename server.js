import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import bodyParser from 'body-parser'
import Razorpay from 'razorpay'
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import fs from "fs";
import multer from "multer";

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
  res.send('AstroWorld Backend is running!')
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

    // Setup email transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      secure: true,
      port: 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    })

    // 1. Email to Customer
    const customerEmailHTML = `
      <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 20px;">
        <div style="max-width: 600px; background: white; margin: auto; border-radius: 10px; overflow: hidden;">
          <div style="background: #6c5ce7; padding: 15px; text-align: center;">
            <h1 style="color: white; margin: 0;">✨ AstroWorld ✨</h1>
          </div>
          <div style="padding: 20px; color: #333;">
            <h2>Hi ${formData.fullName},</h2>
            <p>Thank you for your payment! Your personalized astrology reading is being prepared.</p>
            <h3 style="color: #6c5ce7;">Your Details:</h3>
            <ul>
              <li><b>Phone:</b> ${formData.phone}</li>
              <li><b>DOB:</b> ${formData.dob}</li>
              <li><b>Location:</b> ${formData.city}, ${formData.state}, ${formData.country}</li>
               <li><b>Amount:</b> ${formData.amount}</li>
              <li><b>Payment ID:</b> ${razorpay_payment_id}</li>
              <li><b>Order ID:</b> ${razorpay_order_id}</li>
            </ul>
            <p style="margin-top: 20px;">We will get in touch with you soon with your detailed reading 🌟</p>
            <p style="color: #999; font-size: 12px;">© ${new Date().getFullYear()} AstroWorld</p>
          </div>
        </div>
      </div>
    `

    // 2. Email to Pandit
    const panditEmailHTML = `
      <div style="font-family: Arial, sans-serif; background: #f2f2f2; padding: 20px;">
        <div style="max-width: 600px; background: white; margin: auto; border-radius: 10px; overflow: hidden;">
          <div style="background: #ff7675; padding: 15px; text-align: center;">
            <h1 style="color: white; margin: 0;">🔮 New Astrology Request</h1>
          </div>
          <div style="padding: 20px; color: #333;">
            <h2>Client Details:</h2>
            <ul>
              <li><b>Name:</b> ${formData.fullName}</li>
              <li><b>DOB:</b> ${formData.dob}</li>
              <li><b>Birth Time:</b> ${formData.birthTime}</li>
              <li><b>Location:</b> ${formData.city}, ${formData.state}, ${formData.country}</li>
            </ul>
            <p>Please prepare their personalized reading and upload the Kundli PDF here:</p>
            <p>
              <a href="http://localhost:5173/upload-kundli?email=${encodeURIComponent(formData.email)}"
                 style="background: #0984e3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                📤 Upload Kundli
              </a>
            </p>
            <p style="color: #999; font-size: 12px;">Sent automatically by AstroWorld system</p>
          </div>
        </div>
      </div>
    `;

    // Send emails
    await transporter.sendMail({
      from: `AstroWorld <${process.env.EMAIL_USER}>`,
      to: formData.email,
      subject: '✨ AstroWorld: Payment Successful & Your Reading is Coming',
      html: customerEmailHTML
    })

    await transporter.sendMail({
      from: `AstroWorld <${process.env.EMAIL_USER}>`,
      to: 't06863633@gmail.com',
      subject: '🔮 New Astrology Reading Request',
      html: panditEmailHTML
    })

    console.log('Emails sent to customer and pandit successfully.')
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
    const { email } = req.body; // Get user's email from form or query
    const file = req.file;

    if (!file) {
      return res.status(400).send("No file uploaded");
    }

    // Email setup
    const transporter = nodemailer.createTransport({
      service: "gmail", // or your SMTP
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Send email with PDF attachment
    // Build HTML email template
const kundliEmailHTML = `
  <div style="font-family: Arial, sans-serif; background: #f2f2f2; padding: 20px;">
    <div style="max-width: 600px; background: white; margin: auto; border-radius: 10px; overflow: hidden;">
      <div style="background: #6c5ce7; padding: 15px; text-align: center;">
        <h1 style="color: white; margin: 0;">📜 Your Kundli is Ready</h1>
      </div>
      <div style="padding: 20px; color: #333;">
        <p>Dear User,</p>
        <p>Here is your personalized Kundli, attached with this email.</p>
        <p>Thank you for choosing <b>Aura Jyotish Kendra</b>.  
        We are honored to be a part of your spiritual journey.</p>
        <p style="margin-top: 20px;">Wishing you peace, prosperity, and happiness ✨</p>

        <p style="color: #999; font-size: 12px; margin-top: 30px;">
          🔮 Sent automatically by Aura Jyotish Kendra system
        </p>
      </div>
    </div>
  </div>
`;

// Send mail
await transporter.sendMail({
  from: `Aura jyotish kendra <${process.env.EMAIL_USER}>`,
  to: email, // recipient email
  subject: "📜 Your Kundli PDF",
  html: kundliEmailHTML, // use HTML instead of text
  attachments: [
    {
      filename: file.originalname,
      content: file.buffer, // PDF from memory
    },
  ],
});


    res.json({ message: "PDF sent successfully to user!" });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error sending PDF");
  }
});


const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log('Backend running on port', PORT))
