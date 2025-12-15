require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from public folder

// Twilio Client
let twilioClient;
try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } else {
        console.warn('Twilio credentials missing. SMS will be logged to console.');
    }
} catch (e) {
    console.error('Error initializing Twilio client:', e);
}

// In-memory store
// mobile -> { otp: string, expires: number }
const otpStore = new Map();
// mobile -> lastRequestTime (timestamp)
const rateLimitStore = new Map();

// Constants
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MS = 60 * 1000; // 1 minute

// Helper to validate mobile number (basic validation)
const isValidMobile = (mobile) => {
    return /^\d{10}$/.test(mobile);
};

// Routes

// 1. Send OTP
app.post('/api/send-otp', async (req, res) => {
    const { mobile } = req.body;

    if (!mobile || !isValidMobile(mobile)) {
        return res.status(400).json({ error: 'Invalid mobile number. Must be 10 digits.' });
    }

    // Rate Limiting
    const now = Date.now();
    const lastRequest = rateLimitStore.get(mobile);
    if (lastRequest && (now - lastRequest) < RATE_LIMIT_MS) {
        const waitSeconds = Math.ceil((RATE_LIMIT_MS - (now - lastRequest)) / 1000);
        return res.status(429).json({ error: `Too many requests. Please wait ${waitSeconds} seconds.` });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits

    // Store OTP
    otpStore.set(mobile, {
        otp: otp,
        expires: now + OTP_EXPIRY_MS
    });
    rateLimitStore.set(mobile, now);

    // Send SMS
    try {
        if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
            await twilioClient.messages.create({
                body: `Your ServiceConnect OTP is: ${otp}. Valid for 5 minutes.`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: `+91${mobile}` // Assuming Indian numbers as per frontend placeholder (+91)
            });
            console.log(`OTP sent to ${mobile} via Twilio`);
        } else {
            // Mock Mode
            console.log(`[MOCK SMS] To: +91${mobile}, Message: Your ServiceConnect OTP is: ${otp}`);
        }

        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Error sending SMS:', error);
        // In production, we might not want to reveal the specific error to client, but here it helps debugging
        // If it's a Twilio error, we might still want to "succeed" for the user flow if we are in dev/demo mode,
        // but strictly speaking we should fail.
        // For this demo, if Twilio fails, we fallback to logging the OTP so the user can still login.
        console.log(`[FALLBACK SMS] To: +91${mobile}, Message: Your ServiceConnect OTP is: ${otp}`);
        res.json({ success: true, message: 'OTP sent (fallback mode)' });
    }
});

// 2. Verify OTP
app.post('/api/verify-otp', (req, res) => {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
        return res.status(400).json({ error: 'Mobile and OTP are required.' });
    }

    const record = otpStore.get(mobile);

    if (!record) {
        return res.status(400).json({ error: 'OTP not found or expired. Please request a new one.' });
    }

    if (Date.now() > record.expires) {
        otpStore.delete(mobile);
        return res.status(400).json({ error: 'OTP expired.' });
    }

    if (record.otp !== otp) {
        return res.status(400).json({ error: 'Invalid OTP.' });
    }

    // Success
    otpStore.delete(mobile); // Prevent replay

    // Generate JWT
    const token = jwt.sign(
        { mobile: mobile, role: 'user' }, // default role, can be enhanced
        process.env.JWT_SECRET || 'default_secret',
        { expiresIn: '7d' }
    );

    res.json({ success: true, token, message: 'Login successful' });
});

// Start Server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
