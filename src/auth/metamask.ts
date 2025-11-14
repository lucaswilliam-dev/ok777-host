import express from 'express';
import { ethers, isAddress, verifyMessage } from 'ethers';
import jwt from 'jsonwebtoken';
import cors from 'cors';

const router = express.Router();

// In-memory store for nonces (in production, use Redis or database)
const nonceStore: Record<string, string> = {};

// JWT secret from environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

/**
 * Generate a random nonce for wallet authentication
 */
function generateNonce(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * POST /api/v1/users/auth/nonce
 * Generate a nonce for wallet authentication
 */
router.post('/nonce', async (req, res) => {
  try {
    const { address } = req.body;

    // Validate address format
    if (!address || !isAddress(address)) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid wallet address format'
      });
    }

    // Generate and store nonce
    const nonce = generateNonce();
    nonceStore[address.toLowerCase()] = nonce;

    // Clean up nonce after 5 minutes
    setTimeout(() => {
      delete nonceStore[address.toLowerCase()];
    }, 5 * 60 * 1000);

    res.json({
      code: 200,
      message: 'Nonce generated successfully',
      data: { nonce }
    });
  } catch (error) {
    console.error('Error generating nonce:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/v1/users/auth/verify
 * Verify wallet signature and issue JWT token
 */
router.post('/verify', async (req, res) => {
  try {
    const { address, signature } = req.body;

    // Validate input
    if (!address || !signature) {
      return res.status(400).json({
        code: 400,
        message: 'Address and signature are required'
      });
    }

    if (!isAddress(address)) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid wallet address format'
      });
    }

    // Check if nonce exists for this address
    const storedNonce = nonceStore[address.toLowerCase()];
    if (!storedNonce) {
      return res.status(400).json({
        code: 400,
        message: 'No nonce found for this address. Please request a new nonce.'
      });
    }

    // Create the message that should have been signed
    const message = `Sign this message to authenticate: ${storedNonce}`;

    try {
      // Verify the signature
      const recoveredAddress = verifyMessage(message, signature);
      
      // Check if the recovered address matches the provided address
      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        return res.status(400).json({
          code: 400,
          message: 'Invalid signature. Signature does not match the provided address.'
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          address: address.toLowerCase(),
          type: 'metamask'
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Clean up the used nonce
      delete nonceStore[address.toLowerCase()];

      res.json({
        code: 200,
        message: 'Authentication successful',
        data: { 
          token,
          user: {
            address: address.toLowerCase(),
            type: 'metamask'
          }
        }
      });
    } catch (verifyError) {
      console.error('Signature verification failed:', verifyError);
      return res.status(400).json({
        code: 400,
        message: 'Invalid signature format'
      });
    }
  } catch (error) {
    console.error('Error verifying signature:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/v1/users/profile
 * Get user profile (protected route)
 */
router.get('/profile', async (req, res) => {
  try {
    // This will be protected by JWT middleware
    const user = (req as any).user;
    
    res.json({
      code: 200,
      message: 'Profile retrieved successfully',
      data: {
        user: {
          address: user.address,
          type: user.type,
          authenticatedAt: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Error retrieving profile:', error);
    res.status(500).json({
      code: 500,
      message: 'Internal server error'
    });
  }
});

export default router;
