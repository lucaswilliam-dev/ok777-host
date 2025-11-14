import express from 'express';
import cors from 'cors';
import { Resend } from 'resend';
import crypto from 'crypto';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// JWT Authentication Middleware
const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
        req.user = user;
        next();
    });
};

// In-memory store for verification codes (use Redis in production)
const verificationCodes = new Map();

// Email template
const createEmailTemplate = (code) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OK777 Verification Code</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f4f4f4;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .logo {
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .subtitle {
            font-size: 16px;
            opacity: 0.9;
        }
        .content {
            padding: 40px 30px;
            text-align: center;
        }
        .code-container {
            background-color: #f8f9fa;
            border: 2px dashed #667eea;
            border-radius: 8px;
            padding: 30px;
            margin: 30px 0;
        }
        .verification-code {
            font-size: 36px;
            font-weight: bold;
            color: #667eea;
            letter-spacing: 8px;
            margin: 0;
        }
        .message {
            color: #666;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 20px;
        }
        .warning {
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 5px;
            padding: 15px;
            margin: 20px 0;
            color: #856404;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">OK777</div>
            <div class="subtitle">Email Verification</div>
        </div>
        <div class="content">
            <h2>Your Verification Code</h2>
            <p class="message">
                Thank you for registering with OK777! Please use the verification code below to complete your account setup.
            </p>
            <div class="code-container">
                <p class="verification-code">${code}</p>
            </div>
            <div class="warning">
                <strong>Important:</strong> This code will expire in 5 minutes for security reasons. If you didn't request this code, please ignore this email.
            </div>
            <p class="message">
                Enter this code in the verification form to complete your registration.
            </p>
        </div>
        <div class="footer">
            <p>© 2024 OK777. All rights reserved.</p>
            <p>This is an automated message, please do not reply.</p>
        </div>
    </div>
</body>
</html>
`;

// Generate 6-digit verification code
const generateVerificationCode = () => {
    return crypto.randomInt(100000, 999999).toString();
};

// Clean expired codes
const cleanExpiredCodes = () => {
    const now = Date.now();
    for (const [email, data] of verificationCodes.entries()) {
        if (now > data.expiresAt) {
            verificationCodes.delete(email);
            console.log(`🧹 Cleaned expired code for: ${email}`);
        }
    }
};

// Run cleanup every minute
setInterval(cleanExpiredCodes, 60000);

// Centralized Error Handler
const errorHandler = (err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    
    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(403).json({
            success: false,
            message: 'Invalid token'
        });
    }
    
    if (err.name === 'TokenExpiredError') {
        return res.status(403).json({
            success: false,
            message: 'Token expired'
        });
    }
    
    // Validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
    
    // Default error
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
};

// Routes
app.post('/api/v1/users/verify-email', authenticateJWT, async (req, res) => {
    try {
        const { email } = req.body;

        // Input validation
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Generate verification code
        const code = generateVerificationCode();
        const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes

        // Store code securely
        verificationCodes.set(email.toLowerCase(), {
            code,
            expiresAt,
            attempts: 0
        });

        // Send email using Resend
        const { data, error } = await resend.emails.send({
            from: 'no-reply@ok777.io',
            to: [email],
            subject: 'OK777 Verification Code',
            html: createEmailTemplate(code)
        });

        if (error) {
            console.error('❌ Resend error:', error);
            verificationCodes.delete(email.toLowerCase());
            return res.status(500).json({
                success: false,
                message: 'Failed to send verification email'
            });
        }

        console.log(`✅ Verification email sent to: ${email} (ID: ${data?.id})`);
        
        res.json({
            success: true,
            message: 'Verification code sent successfully',
            data: {
                email,
                expiresIn: '5 minutes'
            }
        });

    } catch (error) {
        console.error('❌ Send verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

app.post('/api/v1/users/confirm-email-code', authenticateJWT, async (req, res) => {
    try {
        const { email, code } = req.body;

        // Input validation
        if (!email || !code) {
            return res.status(400).json({
                success: false,
                message: 'Email and code are required'
            });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Code validation
        if (!/^\d{6}$/.test(code)) {
            return res.status(400).json({
                success: false,
                message: 'Code must be 6 digits'
            });
        }

        const emailKey = email.toLowerCase();
        const storedData = verificationCodes.get(emailKey);

        // Check if code exists
        if (!storedData) {
            console.log(`❌ No verification code found for: ${email}`);
            return res.status(400).json({
                success: false,
                message: 'No verification code found for this email'
            });
        }

        // Check if code is expired
        if (Date.now() > storedData.expiresAt) {
            verificationCodes.delete(emailKey);
            console.log(`⏰ Verification code expired for: ${email}`);
            return res.status(400).json({
                success: false,
                message: 'Verification code has expired'
            });
        }

        // Check attempts limit
        if (storedData.attempts >= 3) {
            verificationCodes.delete(emailKey);
            console.log(`🚫 Too many attempts for: ${email}`);
            return res.status(400).json({
                success: false,
                message: 'Too many verification attempts. Please request a new code'
            });
        }

        // Verify code
        if (storedData.code !== code) {
            storedData.attempts++;
            console.log(`❌ Invalid code attempt for: ${email} (attempt ${storedData.attempts})`);
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }

        // Success - remove code
        verificationCodes.delete(emailKey);
        console.log(`✅ Email verified successfully: ${email}`);

        res.json({
            success: true,
            message: 'Email verified successfully',
            data: {
                email,
                verifiedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Verify code error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'OK777 Email Verification Service is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Use centralized error handler
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 OK777 Email Verification Service running on port ${PORT}`);
    console.log(`📧 Using Resend API with domain: ok777.io`);
    console.log(`⏰ Verification codes expire in 5 minutes`);
});

export default app;
